type SimplePattern = {
  match: RegExp;
  until?: undefined;
  patterns?: undefined;
};

type NestedPattern = {
  match: RegExp;
  until: RegExp;
  patterns: Pattern[];
};

type Pattern = SimplePattern | NestedPattern;

const argsStartReg = /[.a-z0-9$_]*\(/imy;
const enclosedPatterns: Pattern[] = [];
const argOrEndPattern = {
  until: /,\s*[`'"]|\)/my,
  patterns: enclosedPatterns,
} as NestedPattern;
const templateLiteralPattern: NestedPattern = {
  // Template literal
  match: /`/y,
  patterns: [
    {
      // Content
      match: /\\.|\$(?!{)|[^`\\$]+/y,
    },
    {
      // Expressions
      match: /\${/y,
      patterns: enclosedPatterns,
      until: /}/y,
    },
  ],
  until: /`/y,
};

const singleQuotePattern: Pattern = {
  match: /'(?:\\.|[^'\\]+)*'/y,
};

const doubleQuotePattern: Pattern = {
  match: /"(?:\\.|[^"\\]+)*"/y,
};

enclosedPatterns.push(
  {
    // Ignored
    match: /[a-z0-9_$#@.]+/iy,
  },
  {
    // Line comments
    match: /\/\/.*$/y,
  },
  {
    // Multi line comments
    match: /\/\*.*?\*\//y,
  },
  {
    // Parens
    match: /\(/y,
    patterns: enclosedPatterns,
    until: /\)/y,
  },
  {
    // Braces
    match: /{/y,
    patterns: enclosedPatterns,
    until: /}/y,
  },
  {
    // Brackets
    match: /\[/y,
    patterns: enclosedPatterns,
    until: /]/y,
  },
  singleQuotePattern,
  doubleQuotePattern,
  templateLiteralPattern,
  {
    // RegExp
    match: /\/(?:\\.|\[(?:\\.|[^\]\\]+)\]|[^[/\\])+\/[a-z]*/iy,
  }
);

export default function getLastArgumentPos(src: string, callStartPos: number) {
  argsStartReg.lastIndex = callStartPos;
  if (!argsStartReg.test(src)) return false;

  const start = findPattern(src, argsStartReg.lastIndex, argOrEndPattern) - 1;
  if (start < 0) return false;

  let end = start;

  switch (src[end]) {
    case ")":
      return {
        start,
        end,
      };
    case "`":
      end = findPattern(src, start + 1, templateLiteralPattern);
      break;
    case "'":
      singleQuotePattern.match.lastIndex = start;
      end = singleQuotePattern.match.test(src)
        ? singleQuotePattern.match.lastIndex
        : -1;
      break;
    case '"':
      singleQuotePattern.match.lastIndex = start;
      end = singleQuotePattern.match.test(src)
        ? singleQuotePattern.match.lastIndex
        : -1;
      break;
    default:
      return false;
  }

  if (end < 0) return false;

  return {
    start,
    end,
  };
}

function findPattern(
  str: string,
  startPos: number,
  searchPattern: NestedPattern
) {
  const stack: NestedPattern[] = [searchPattern];
  let pos = startPos;

  do {
    const { until, patterns } = stack[stack.length - 1];
    outer: while (pos < str.length) {
      for (const pattern of patterns) {
        pattern.match.lastIndex = pos;
        if (pattern.match.test(str)) {
          pos = pattern.match.lastIndex;
          if (pattern.until) {
            stack.push(pattern);
            break outer;
          } else {
            continue outer;
          }
        }
      }

      until.lastIndex = pos;
      if (until.test(str)) {
        pos = until.lastIndex;
        if (stack.length === 1) return pos;
        stack.pop();
        break;
      }

      pos++;
    }
  } while (pos < str.length && stack.length);

  return -1;
}
