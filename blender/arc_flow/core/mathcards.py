"""Math-card expression engine.

A math card is a list of terms.  Each term has:
  op     how it combines with what is to its left: ADD SUB MUL DIV POW ROOT (ignored on the first term)
  kind   CARD (physics card value), GROUP (a named parenthesised sub-expression) or CONST
  ref    physics-card name / group name
  value  constant (CONST)
  group  '' for the top level, or the name of the group this term belongs to ("Group A"...)

Groups behave as parentheses.  Precedence: groups > POW/ROOT (radical) > MUL/DIV > ADD/SUB.
ROOT means  left ** (1/right)  (so `x ROOT 2` is the square root of x).
"""
import math
from collections import namedtuple

Term = namedtuple('Term', 'op kind ref value group')
OPS = [('ADD', "Add", '+'), ('SUB', "Subtract", '-'), ('MUL', "Multiply", '*'),
       ('DIV', "Divide", '/'), ('POW', "Exponent", '^'), ('ROOT', "Radical", 'root')]


def group_name(index):
    """0 -> 'Group A', 25 -> 'Group Z', 26 -> 'Group AA'."""
    s, n = '', index
    while True:
        s = chr(ord('A') + n % 26) + s
        n = n // 26 - 1
        if n < 0:
            break
    return "Group " + s


def _apply(op, a, b):
    try:
        if op == 'ADD':
            return a + b
        if op == 'SUB':
            return a - b
        if op == 'MUL':
            return a * b
        if op == 'DIV':
            return a / b if b != 0.0 else 0.0
        if op == 'POW':
            r = a ** b
            return r.real if isinstance(r, complex) else r
        if op == 'ROOT':
            if b == 0.0:
                return 0.0
            r = a ** (1.0 / b)
            return r.real if isinstance(r, complex) else r
    except (OverflowError, ZeroDivisionError, ValueError):
        return 0.0
    raise ValueError(op)


def _reduce(items):
    """items: [(op, value), ...] first op ignored.  Apply precedence passes."""
    vals = [items[0][1]]
    ops = []
    for op, v in items[1:]:
        ops.append(op)
        vals.append(v)
    # pass 1: POW / ROOT, right to left (right associative)
    i = len(ops) - 1
    while i >= 0:
        if ops[i] in ('POW', 'ROOT'):
            vals[i] = _apply(ops[i], vals[i], vals[i + 1])
            del vals[i + 1]
            del ops[i]
        i -= 1
    # pass 2: MUL / DIV left to right
    i = 0
    while i < len(ops):
        if ops[i] in ('MUL', 'DIV'):
            vals[i] = _apply(ops[i], vals[i], vals[i + 1])
            del vals[i + 1]
            del ops[i]
        else:
            i += 1
    # pass 3: ADD / SUB
    out = vals[0]
    for op, v in zip(ops, vals[1:]):
        out = _apply(op, out, v)
    return out


def evaluate(terms, resolve_card, group='', _stack=()):
    """Evaluate the terms of `group` ('' = top level).  `resolve_card(name) -> float`."""
    mine = [t for t in terms if t.group == group]
    if not mine:
        return 0.0
    items = []
    for t in mine:
        if t.kind == 'CARD':
            v = float(resolve_card(t.ref))
        elif t.kind == 'GROUP':
            if t.ref in _stack or t.ref == group:
                v = 0.0   # cycle guard
            else:
                v = evaluate(terms, resolve_card, t.ref, _stack + (group,))
        else:
            v = float(t.value)
        items.append((t.op, v))
    out = _reduce(items)
    if isinstance(out, float) and (math.isnan(out) or math.isinf(out)):
        return 0.0
    return out


def to_string(terms, group=''):
    """Human readable form, e.g.  (m1 / d2) * Group A."""
    mine = [t for t in terms if t.group == group]
    sym = {o[0]: o[2] for o in OPS}
    out = []
    for i, t in enumerate(mine):
        operand = t.ref if t.kind == 'CARD' else ("(" + to_string(terms, t.ref) + ")" if t.kind == 'GROUP' else repr(t.value))
        out.append(operand if i == 0 else " %s %s" % (sym[t.op], operand))
    return "".join(out)
