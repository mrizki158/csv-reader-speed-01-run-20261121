// A faster drop-in replacement for csv-reader 1.0.0: run(input) returns exactly csv-reader's answer
// {columns, rows, errors} for input {text, header}, byte for byte, but reads the text with char-code
// scans and one slice per clean field segment instead of building every field a character at a time.
//
// The reading policy is csv-reader's own, unchanged:
//   - a U+FEFF at the very start of the text is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is no record;
//   - outside quotes a CR not followed by LF is dropped (stray_cr);
//   - a field that opens with a quote runs to the next quote that is not doubled, "" inside it one
//     quote, each CRLF or lone CR inside it read as LF; what follows its closing quote, up to the
//     next comma or line break, is appended as it stands (quote_junk, when the field ends); a quote
//     that never closes is a literal character and the text after it is read again as unquoted
//     (unterminated_quote);
//   - a quote inside an unquoted field is a literal character; fields stay strings;
//   - columns is the first record when header is true, else null; rows holds the records after it,
//     each padded with "" (short_row, with fields: its count) or cut (long_row, with extra: the cut
//     fields) to the first record's width;
//   - each error is {code, line, row}, in the order met: line the 1-based line its record starts on
//     (every LF, CRLF and lone CR inside quotes counted), row its record's index in rows, null for
//     the header.

// How a field ended.
const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader's answer for one case's input {text, header}: {columns, rows, errors}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const n = text.length;
  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  // The field just read, shared through these instead of a fresh object per field.
  let fValue = '';
  let fEnded = END;
  let fAdded = 0;

  // Reads unquoted characters onto `init` up to the next comma or line break: a CR not followed by
  // LF is dropped (stray_cr). Sets fValue (init plus what was kept), fEnded and fAdded (the number
  // of characters this call kept). Clean runs are a single slice; only a stray CR splits segments.
  function readUnquoted(init) {
    let parts = null;
    let seg = pos; // start of the current kept segment
    let added = 0;
    let end = pos;
    for (;;) {
      if (pos >= n) {
        end = pos;
        fEnded = END;
        break;
      }
      const c = text.charCodeAt(pos);
      if (c > 44) {
        pos += 1;
        continue;
      }
      if (c === 44) {
        end = pos;
        pos += 1;
        fEnded = COMMA;
        break;
      }
      if (c === 10) {
        end = pos;
        pos += 1;
        line += 1;
        fEnded = LINE_BREAK;
        break;
      }
      if (c === 13) {
        if (text.charCodeAt(pos + 1) === 10) {
          end = pos;
          pos += 2;
          line += 1;
          fEnded = LINE_BREAK;
          break;
        }
        if (parts === null) parts = [];
        parts.push(text.slice(seg, pos));
        added += pos - seg;
        errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
        pos += 1;
        seg = pos;
        continue;
      }
      pos += 1;
    }
    if (parts === null) {
      fValue = init + text.slice(seg, end);
      fAdded = end - seg;
    } else {
      parts.push(text.slice(seg, end));
      fValue = init + parts.join('');
      fAdded = added + (end - seg);
    }
  }

  // Reads a quoted field whose opening quote is at pos. Sets fValue and fEnded (via readUnquoted
  // when the quote never closes or junk follows the closing quote).
  function readQuoted() {
    const open = pos;
    const openLine = line;
    pos += 1;
    let seg = pos; // start of the current kept segment
    let parts = null;
    for (;;) {
      if (pos >= n) {
        // The quote never closes: it is a literal character, and the text after it is read again
        // as unquoted.
        pos = open + 1;
        line = openLine;
        errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
        readUnquoted('"');
        return;
      }
      const c = text.charCodeAt(pos);
      if (c > 34) {
        pos += 1;
        continue;
      }
      if (c === 34) {
        if (text.charCodeAt(pos + 1) === 34) {
          if (parts === null) parts = [];
          parts.push(text.slice(seg, pos), '"');
          pos += 2;
          seg = pos;
          continue;
        }
        // The closing quote.
        let value;
        if (parts === null) {
          value = text.slice(seg, pos);
        } else {
          parts.push(text.slice(seg, pos));
          value = parts.join('');
        }
        pos += 1;
        if (pos >= n) {
          fValue = value;
          fEnded = END;
          return;
        }
        const d = text.charCodeAt(pos);
        if (d === 44) {
          pos += 1;
          fValue = value;
          fEnded = COMMA;
          return;
        }
        if (d === 10) {
          pos += 1;
          line += 1;
          fValue = value;
          fEnded = LINE_BREAK;
          return;
        }
        if (d === 13 && text.charCodeAt(pos + 1) === 10) {
          pos += 2;
          line += 1;
          fValue = value;
          fEnded = LINE_BREAK;
          return;
        }
        // What follows the closing quote is appended as it stands, up to the next comma or line
        // break (quote_junk, when the field ends and anything was appended).
        readUnquoted(value);
        if (fAdded > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
        return;
      }
      if (c === 13) {
        // CRLF and a lone CR inside quotes are each one LF.
        if (parts === null) parts = [];
        parts.push(text.slice(seg, pos), '\n');
        line += 1;
        pos += text.charCodeAt(pos + 1) === 10 ? 2 : 1;
        seg = pos;
        continue;
      }
      if (c === 10) line += 1;
      pos += 1;
    }
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let quoted = false;
    for (;;) {
      if (text.charCodeAt(pos) === 34) {
        quoted = true;
        readQuoted();
      } else {
        quoted = false;
        // The unquoted read, inlined: scan to the next comma or line break, dropping stray CRs.
        let parts = null;
        let seg = pos;
        let added = 0;
        let end = pos;
        for (;;) {
          if (pos >= n) {
            end = pos;
            fEnded = END;
            break;
          }
          const c = text.charCodeAt(pos);
          if (c > 44) {
            pos += 1;
            continue;
          }
          if (c === 44) {
            end = pos;
            pos += 1;
            fEnded = COMMA;
            break;
          }
          if (c === 10) {
            end = pos;
            pos += 1;
            line += 1;
            fEnded = LINE_BREAK;
            break;
          }
          if (c === 13) {
            if (text.charCodeAt(pos + 1) === 10) {
              end = pos;
              pos += 2;
              line += 1;
              fEnded = LINE_BREAK;
              break;
            }
            if (parts === null) parts = [];
            parts.push(text.slice(seg, pos));
            added += pos - seg;
            errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
            pos += 1;
            seg = pos;
            continue;
          }
          pos += 1;
        }
        if (parts === null) {
          fValue = text.slice(seg, end);
        } else {
          parts.push(text.slice(seg, end));
          fValue = parts.join('');
        }
      }
      fields.push(fValue);
      if (fEnded !== COMMA) break;
    }

    // A line that held only stray CRs is left with no characters: no record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
