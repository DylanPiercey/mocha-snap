const lineReg = /\r?\n/g;

export default function getLinePositions(src: string) {
  const result = [0];

  while (lineReg.test(src)) {
    result.push(lineReg.lastIndex);
  }

  return result;
}
