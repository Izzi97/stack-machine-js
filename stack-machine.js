"use strict";

export default class StackMachine {
  static operations = {
    halt: "halt",
    noOperation: "noOperation",
    push: "push",
    pop: "pop",
    store: "store",
    load: "load",
    add: "add",
    subtract: "subtract",
    multiply: "multiply",
    divide: "divide",
    less: "less",
    greater: "greater",
    same: "same",
    different: "different",
    and: "and",
    or: "or",
    not: "not",
    jump: "jump",
    jumpConditionally: "jumpConditionally",
  };

  static getOpNameByCode(opCode) {
    const opName = Object.keys(StackMachine.operations)[opCode];

    if (opName === undefined)
      throw new RangeError(`invalid operation code ${opCode}`);

    return opName;
  }

  static getOpCodeByName(opName) {
    const opCode = Object.keys(StackMachine.operations).findIndex(
      (op) => op === opName
    );

    if (opCode === -1) throw new Error(`invalid operation name ${opName}`);

    return opCode;
  }

  static wordSize = 8;
  static stackSize = 2 ** this.wordSize;
  static memorySize = 2 ** this.wordSize;

  #stack = new Int8Array(StackMachine.stackSize);
  #stackCounter = 0;
  #memory = new Int8Array(StackMachine.memorySize);
  #instructionPointer = 0;

  /**
   * load instructions and initial data into memory
   *
   * @throws on type- or size-mismatch on argument
   *
   * @param {Int8Array} words
   */
  load(words) {
    if (!(words instanceof Int8Array))
      throw new TypeError("program must be of type Int8Array");

    if (words.length === 0) throw new RangeError("program must not be empty");

    if (words.length > StackMachine.memorySize)
      throw new RangeError("program size must not exceed memory size");

    for (let i = 0; i < words.length; i++) {
      this.#memory[i] = words[i];
    }
  }

  /**
   * executes next instruction under memory pointer
   *
   * modifies machine state and returns state change report
   */
  execute() {
    try {
      const opCode = this.#memory[this.#instructionPointer];
      const opName = StackMachine.getOpNameByCode(opCode);
      const op = this.#getOperationByName(opName);

      const {
        halt = false,
        numStackValuesPopped = 0,
        stackValuesPushed = [],
        memoryAddressWritten,
        memoryValueWritten,
        instructionPointerDiff,
      } = op();

      let intermediateStackCounter = this.#stackCounter - numStackValuesPopped;
      this.#stack.fill(0, intermediateStackCounter, this.#stackCounter);
      for (const value of stackValuesPushed) {
        this.#stack[intermediateStackCounter++] = value;
      }
      this.#stackCounter = intermediateStackCounter;

      if (memoryAddressWritten !== undefined) {
        this.#memory[memoryAddressWritten] = memoryValueWritten;
      }

      this.#instructionPointer += instructionPointerDiff;

      return {
        success: true,
        opName,
        opCode,
        halt,
        numStackValuesPopped,
        stackValuesPushed,
        instructionPointerDiff,
        memoryAddressWritten,
        memoryValueWritten,
      };
    } catch (error) {
      return {
        success: false,
        error,
      };
    }
  }

  /**
   * clears stack & memory to zeros, sets memory pointer to zero
   *
   * always succeeds
   */
  reset() {
    this.#stack.fill(0);
    this.#stackCounter = 0;
    this.#memory.fill(0);
    this.#instructionPointer = 0;
  }

  #halt() {
    return this.#defineSafeStateChange({ halt: true });
  }

  #noOperation() {
    return this.#defineSafeStateChange({ instructionPointerDiff: 1 });
  }

  #push() {
    this.#ensureMemoryBounds(this.#instructionPointer + 1);

    return this.#defineSafeStateChange({
      stackValuesPushed: [this.#memory[this.#instructionPointer + 1]],
      instructionPointerDiff: 2,
    });
  }

  #pop() {
    return this.#defineSafeStateChange({
      numStackValuesPopped: 1,
      instructionPointerDiff: 1,
    });
  }

  #store() {
    this.#ensureStackCount(2);

    return this.#defineSafeStateChange({
      numStackValuesPopped: 2,
      memoryAddressWritten: this.#stack[this.#stackCounter - 1],
      memoryValueWritten: this.#stack[this.#stackCounter - 2],
      instructionPointerDiff: 1,
    });
  }

  #load() {
    this.#ensureStackCount(1);

    return this.#defineSafeStateChange({
      numStackValuesPopped: 1,
      stackValuesPushed: [this.#memory[this.#stack[this.#stackCounter - 1]]],
      instructionPointerDiff: 1,
    });
  }

  #add() {
    this.#ensureStackCount(2);

    return this.#defineSafeStateChange({
      numStackValuesPopped: 2,
      stackValuesPushed: [
        this.#stack[this.#stackCounter - 1] +
          this.#stack[this.#stackCounter - 2],
      ],
      instructionPointerDiff: 1,
    });
  }

  #subtract() {
    this.#ensureStackCount(2);

    return this.#defineSafeStateChange({
      numStackValuesPopped: 2,
      stackValuesPushed: [
        this.#stack[this.#stackCounter - 1] -
          this.#stack[this.#stackCounter - 2],
      ],
      instructionPointerDiff: 1,
    });
  }

  #multiply() {
    this.#ensureStackCount(2);

    return this.#defineSafeStateChange({
      numStackValuesPopped: 2,
      stackValuesPushed: [
        this.#stack[this.#stackCounter - 1] *
          this.#stack[this.#stackCounter - 2],
      ],
      instructionPointerDiff: 1,
    });
  }

  /**
   * pushes both the quotient and the remainder as two separat words onto the stack
   *
   * in case of division by zero, sets both quotient and remainder to dividend value
   *
   * @throws if stack holds less than two values
   */
  #divide() {
    this.#ensureStackCount(2);

    const dividend = this.#stack[this.#stackCounter - 1];
    const divisor = this.#stack[this.#stackCounter - 2];
    let quotient, remainder;
    if (divisor === 0) {
      quotient = remainder = dividend;
    } else {
      quotient = Math.floor(dividend / divisor);
      remainder = dividend % divisor;
    }

    return this.#defineSafeStateChange({
      numStackValuesPopped: 2,
      stackValuesPushed: [remainder, quotient],
      instructionPointerDiff: 1,
    });
  }

  #less() {
    this.#ensureStackCount(2);

    return this.#defineSafeStateChange({
      numStackValuesPopped: 2,
      stackValuesPushed: [
        this.#stack[this.#stackCounter - 1] <
        this.#stack[this.#stackCounter - 2]
          ? 1
          : 0,
      ],
      instructionPointerDiff: 1,
    });
  }

  #greater() {
    this.#ensureStackCount(2);

    return this.#defineSafeStateChange({
      numStackValuesPopped: 2,
      stackValuesPushed: [
        this.#stack[this.#stackCounter - 1] >
        this.#stack[this.#stackCounter - 2]
          ? 1
          : 0,
      ],
      instructionPointerDiff: 1,
    });
  }

  #same() {
    this.#ensureStackCount(2);

    return this.#defineSafeStateChange({
      numStackValuesPopped: 2,
      stackValuesPushed: [
        this.#stack[this.#stackCounter - 1] ===
        this.#stack[this.#stackCounter - 2]
          ? 1
          : 0,
      ],
      instructionPointerDiff: 1,
    });
  }

  #different() {
    this.#ensureStackCount(2);

    return this.#defineSafeStateChange({
      numStackValuesPopped: 2,
      stackValuesPushed: [
        this.#stack[this.#stackCounter - 1] !==
        this.#stack[this.#stackCounter - 2]
          ? 1
          : 0,
      ],
      instructionPointerDiff: 1,
    });
  }

  #and() {
    this.#ensureStackCount(2);

    return this.#defineSafeStateChange({
      numStackValuesPopped: 2,
      stackValuesPushed: [
        this.#stack[this.#stackCounter - 1] === 1 &&
        this.#stack[this.#stackCounter - 2] === 1
          ? 1
          : 0,
      ],
      instructionPointerDiff: 1,
    });
  }

  #or() {
    this.#ensureStackCount(2);

    return this.#defineSafeStateChange({
      numStackValuesPopped: 2,
      stackValuesPushed: [
        this.#stack[this.#stackCounter - 1] === 1 ||
        this.#stack[this.#stackCounter - 2] === 1
          ? 1
          : 0,
      ],
      instructionPointerDiff: 1,
    });
  }

  #not() {
    this.#ensureStackCount(1);

    return this.#defineSafeStateChange({
      numStackValuesPopped: 1,
      stackValuesPushed: [this.#stack[this.#stackCounter - 1] === 0 ? 1 : 0],
      instructionPointerDiff: 1,
    });
  }

  #jump() {
    this.#ensureStackCount(1);
    return this.#defineSafeStateChange({
      numStackValuesPopped: 1,
      instructionPointerDiff:
        this.#stack[this.#stackCounter - 1] - this.#instructionPointer,
    });
  }

  #jumpConditionally() {
    this.#ensureStackCount(2);

    return this.#defineSafeStateChange({
      numStackValuesPopped: 2,
      instructionPointerDiff:
        this.#stack[this.#stackCounter - 1] === 1
          ? this.#stack[this.#stackCounter - 2] - this.#instructionPointer
          : 1,
    });
  }

  #getOperationByName(opName) {
    // bind the this arg to not loose track of the class instance
    // since JS only passes the raw function without a reference to the class instance ...
    switch (opName) {
      case StackMachine.operations.halt:
        return this.#halt.bind(this);
      case StackMachine.operations.noOperation:
        return this.#noOperation.bind(this);
      case StackMachine.operations.push:
        return this.#push.bind(this);
      case StackMachine.operations.pop:
        return this.#pop.bind(this);
      case StackMachine.operations.store:
        return this.#store.bind(this);
      case StackMachine.operations.load:
        return this.#load.bind(this);
      case StackMachine.operations.add:
        return this.#add.bind(this);
      case StackMachine.operations.subtract:
        return this.#subtract.bind(this);
      case StackMachine.operations.multiply:
        return this.#multiply.bind(this);
      case StackMachine.operations.divide:
        return this.#divide.bind(this);
      case StackMachine.operations.less:
        return this.#less.bind(this);
      case StackMachine.operations.greater:
        return this.#greater.bind(this);
      case StackMachine.operations.same:
        return this.#same.bind(this);
      case StackMachine.operations.different:
        return this.#different.bind(this);
      case StackMachine.operations.and:
        return this.#and.bind(this);
      case StackMachine.operations.or:
        return this.#or.bind(this);
      case StackMachine.operations.not:
        return this.#not.bind(this);
      case StackMachine.operations.jump:
        return this.#jump.bind(this);
      case StackMachine.operations.jumpConditionally:
        return this.#jumpConditionally.bind(this);
      default:
        throw new Error(
          `no implementation for operation '${opName}' available - this should not happen`
        );
    }
  }

  #ensureMemoryBounds(address) {
    if (address < 0 || address >= StackMachine.memorySize)
      throw new RangeError(`address '${address}' out of memory bounds`);
  }

  #ensureStackBounds(address) {
    if (address < 0 || address >= StackMachine.stackSize)
      throw new RangeError(`address '${address}' out of stack bounds`);
  }

  #ensureStackCount(amount) {
    if (this.#stackCounter < amount)
      throw new RangeError(`stack must contain at least ${amount} items`);
  }

  /**
   * constructs and validates command for machine state change
   *
   * throws if any machine state constraints are violated
   */
  #defineSafeStateChange({
    halt = false,
    numStackValuesPopped = 0,
    stackValuesPushed = [],
    memoryAddressWritten = undefined,
    memoryValueWritten = undefined,
    instructionPointerDiff,
  }) {
    if (typeof halt !== "boolean") this.#fail(halt);

    if (!this.#isInStackCount(numStackValuesPopped))
      this.#fail(numStackValuesPopped);

    if (
      !Array.isArray(stackValuesPushed) ||
      !stackValuesPushed.every(StackMachine.isInValueRange)
    )
      this.#fail(stackValuesPushed);

    if (
      memoryAddressWritten !== undefined &&
      !StackMachine.isInAddressRange(memoryAddressWritten)
    )
      this.#fail(memoryAddressWritten);

    if (
      memoryValueWritten !== undefined &&
      !StackMachine.isInValueRange(memoryValueWritten)
    )
      this.#fail(memoryValueWritten);

    if (
      !halt &&
      !StackMachine.isInAddressRange(
        this.#instructionPointer + instructionPointerDiff
      )
    )
      this.#fail(instructionPointerDiff);

    return {
      halt,
      numStackValuesPopped,
      stackValuesPushed,
      memoryAddressWritten,
      memoryValueWritten,
      instructionPointerDiff,
    };
  }

  #isInStackCount(value) {
    return (
      (Number.isInteger(value) && 0 <= value) || value < this.#stackCounter
    );
  }

  static isInValueRange(value) {
    return (
      Number.isInteger(value) &&
      -(2 ** (StackMachine.wordSize - 1)) <= value &&
      value <= 2 ** (StackMachine.wordSize - 1) - 1
    );
  }

  static isInAddressRange(address) {
    return (
      Number.isInteger(address) &&
      0 <= address &&
      address < StackMachine.memorySize
    );
  }

  #fail(message) {
    throw new Error(message);
  }
}
