import StackMachine from "./stack-machine.js";

export default class Assembly {
  static mnemonics = {
    [StackMachine.operations.halt]: "ha",
    [StackMachine.operations.noOperation]: "no",
    [StackMachine.operations.push]: "pu",
    [StackMachine.operations.pop]: "po",
    [StackMachine.operations.store]: "st",
    [StackMachine.operations.load]: "lo",
    [StackMachine.operations.add]: "ad",
    [StackMachine.operations.subtract]: "su",
    [StackMachine.operations.multiply]: "mu",
    [StackMachine.operations.divide]: "di",
    [StackMachine.operations.less]: "le",
    [StackMachine.operations.greater]: "gr",
    [StackMachine.operations.same]: "sa",
    [StackMachine.operations.different]: "df",
    [StackMachine.operations.and]: "an",
    [StackMachine.operations.or]: "or",
    [StackMachine.operations.not]: "nt",
    [StackMachine.operations.jump]: "ju",
    [StackMachine.operations.jumpConditionally]: "jc",
  };

  /**
   * parse a string of program text into an array op codes and data words
   * @param {string} programText
   * @returns {ParseTree}
   * @throws on syntax error
   */
  static parseProgram(programText) {
    const lines = programText
      .split("\n")
      .map((line) => line?.trim())
      .filter((line) => line !== undefined && line !== "");

    if (lines.length > StackMachine.memorySize)
      throw new RangeError("program length exceeds memory size");

    const lineTokens = lines.map((line) => {
      const captures = /\s*([\w\d-]+)\s*(#([^\n]+))?/.exec(line);
      return { code: captures[1], comment: captures[3] };
    });

    return lineTokens.map(({ code, comment }) => {
      if (!isNaN(parseInt(code)))
        return { code, type: "data", value: parseInt(code), comment };

      for (const [opName, mnemonic] of Object.entries(Assembly.mnemonics)) {
        if (code === mnemonic) return { code, type: opName, comment };
      }

      throw new Error(`invalid assembly code ${code}`);
    });
  }

  /**
   * generate machine instructions as op code words from a parsed syntax tree
   * @param {ParseTree} parseTree
   * @returns {Int8Array}
   * @throws on invalid op code
   */
  static generateInstructions(parseTree) {
    return new Int8Array(
      parseTree.map(({ type, value }, index) => {
        if (type === "data") {
          if (!StackMachine.isInValueRange(value))
            throw new RangeError(
              `data value ${value} at parse tree node ${index} exceeds value range`
            );
          return value;
        } else return StackMachine.getOpCodeByName(type);
      })
    );
  }
}
