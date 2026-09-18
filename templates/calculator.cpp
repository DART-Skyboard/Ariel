/******************************************************************************
 * calculator.cpp — single-file scientific calculator
 *
 * No third-party libraries. No packages. No frameworks.
 *   Windows  : native GUI through the Win32 API (windows.h is the OS)
 *   elsewhere: terminal GUI drawn with box characters (C++ standard library)
 *
 * Algebraic entry: type the full expression, then equals.
 *   x^n     raise to a chosen exponent     2 x^n 8 = 256
 *   nrt     nth root (index nrt radicand)  3 nrt (8+19) = 3
 *   ( )     group sub-expressions          (1+2)*(3+4)^2 = 147
 *
 * Build on Windows (MinGW):
 *   g++ calculator.cpp -o calculator.exe -std=c++17 -luser32 -lgdi32
 *
 * Build on Windows (MSVC from a Developer Command Prompt):
 *   cl /EHsc /std:c++17 calculator.cpp user32.lib gdi32.lib
 *
 * Build on macOS / Linux (terminal GUI):
 *   g++ calculator.cpp -o calculator -std=c++17
 *   ./calculator
 ******************************************************************************/

#include <algorithm>
#include <cctype>
#include <cmath>
#include <cstdio>
#include <iostream>
#include <limits>
#include <stdexcept>
#include <string>
#include <vector>

#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#endif

static const double PI = std::acos(-1.0);
static const double EULER = std::exp(1.0);

enum class Kind { Num, Op, Lp, Rp, Fn, Const, Post };

struct Tok {
    Kind kind;
    std::string v;
};

struct CalcError : std::runtime_error {
    using std::runtime_error::runtime_error;
};

static double tidy(double n) {
    if (!std::isfinite(n) || n == 0.0) return n;
    const double nearest = std::round(n);
    if (std::fabs(n - nearest) <= std::fabs(n) * 1e-12) return nearest;
    return n;
}

static std::string fmt(double n) {
    if (!std::isfinite(n)) return "Error";
    n = tidy(n);
    if (n == 0.0) return "0";
    char buf[64];
    std::snprintf(buf, sizeof(buf), "%.12g", n);
    return std::string(buf);
}

static const char* opSym(const std::string& o) {
    if (o == "+") return "+";
    if (o == "-") return "-";
    if (o == "*") return "*";
    if (o == "/") return "/";
    if (o == "^") return "^";
    if (o == "r") return "nrt";
    return o.c_str();
}

static const char* fnLab(const std::string& n) {
    if (n == "asin") return "asin";
    if (n == "acos") return "acos";
    if (n == "atan") return "atan";
    if (n == "sinh") return "sinh";
    if (n == "cosh") return "cosh";
    if (n == "tanh") return "tanh";
    if (n == "asinh") return "asinh";
    if (n == "acosh") return "acosh";
    if (n == "atanh") return "atanh";
    if (n == "exp") return "exp";
    if (n == "exp10") return "10^";
    if (n == "sqrt") return "sqrt";
    if (n == "cbrt") return "cbrt";
    if (n == "abs") return "abs";
    return n.c_str();
}

static std::string formatTokens(const std::vector<Tok>& t) {
    std::string s;
    for (const auto& x : t) {
        switch (x.kind) {
            case Kind::Num:   s += x.v; break;
            case Kind::Op:    s += opSym(x.v); break;
            case Kind::Lp:    s += "("; break;
            case Kind::Rp:    s += ")"; break;
            case Kind::Fn:    s += fnLab(x.v); break;
            case Kind::Const: s += x.v; break;
            case Kind::Post:  s += x.v; break;
        }
    }
    return s;
}

static int openParens(const std::vector<Tok>& t) {
    int d = 0;
    for (const auto& x : t) {
        if (x.kind == Kind::Lp) ++d;
        else if (x.kind == Kind::Rp) --d;
    }
    return d;
}

static bool endsComplete(const std::vector<Tok>& t) {
    if (t.empty()) return false;
    const Kind k = t.back().kind;
    return k == Kind::Num || k == Kind::Rp || k == Kind::Const || k == Kind::Post;
}

static bool needsImplicit(const std::vector<Tok>& t) { return endsComplete(t); }

static bool isSinglePrimary(const std::vector<Tok>& t) {
    if (t.empty()) return false;
    if (t.size() == 1) return t[0].kind == Kind::Num || t[0].kind == Kind::Const;
    if (t.size() == 2 && t[0].kind == Kind::Num && t[1].kind == Kind::Post) return true;
    if (t[0].kind != Kind::Lp && t[0].kind != Kind::Fn) return false;
    int d = 0;
    bool started = false;
    for (size_t i = 0; i < t.size(); ++i) {
        if (t[i].kind == Kind::Lp) { ++d; started = true; }
        else if (t[i].kind == Kind::Rp) --d;
        if (started && d == 0)
            return i == t.size() - 1 || (i == t.size() - 2 && t[i + 1].kind == Kind::Post);
    }
    return false;
}

static void pushImplicit(std::vector<Tok>& t) {
    if (needsImplicit(t)) t.push_back({Kind::Op, "*"});
}

static int mantissaDigits(const std::string& value) {
    const auto epos = value.find_first_of("eE");
    const std::string mant = epos == std::string::npos ? value : value.substr(0, epos);
    int n = 0;
    for (char c : mant) if (c != '-' && c != '.') ++n;
    return n;
}

static double factorial(double n) {
    if (n < 0.0 || std::floor(n) != n) return std::numeric_limits<double>::quiet_NaN();
    if (n > 170.0) return std::numeric_limits<double>::infinity();
    double r = 1.0;
    for (int i = 2; i <= (int)n; ++i) r *= i;
    return r;
}

static double nthRoot(double n, double x) {
    if (n == 0.0) return std::numeric_limits<double>::quiet_NaN();
    if (x < 0.0) {
        if (std::floor(n) == n && std::fmod(std::fabs(n), 2.0) == 1.0)
            return -std::pow(-x, 1.0 / n);
        return std::numeric_limits<double>::quiet_NaN();
    }
    return std::pow(x, 1.0 / n);
}

static double applyFn(const std::string& name, double n, bool deg) {
    const double rad = deg ? n * PI / 180.0 : n;
    const auto fromRad = [deg](double x) { return deg ? x * 180.0 / PI : x; };
    if (name == "sin") return std::sin(rad);
    if (name == "cos") return std::cos(rad);
    if (name == "tan") return std::tan(rad);
    if (name == "asin") return fromRad(std::asin(n));
    if (name == "acos") return fromRad(std::acos(n));
    if (name == "atan") return fromRad(std::atan(n));
    if (name == "sinh") return std::sinh(n);
    if (name == "cosh") return std::cosh(n);
    if (name == "tanh") return std::tanh(n);
    if (name == "asinh") return std::asinh(n);
    if (name == "acosh") return std::acosh(n);
    if (name == "atanh") return std::atanh(n);
    if (name == "ln") return std::log(n);
    if (name == "exp") return std::exp(n);
    if (name == "log") return std::log10(n);
    if (name == "exp10") return std::pow(10.0, n);
    if (name == "sqrt") return std::sqrt(n);
    if (name == "cbrt") return std::cbrt(n);
    if (name == "abs") return std::fabs(n);
    return std::numeric_limits<double>::quiet_NaN();
}

static std::vector<Tok> prepare(std::vector<Tok> t) {
    while (!t.empty() && t.back().kind == Kind::Op) t.pop_back();
    int d = 0;
    for (const auto& x : t) {
        if (x.kind == Kind::Lp) ++d;
        else if (x.kind == Kind::Rp) --d;
        if (d < 0) throw CalcError("Mismatched parentheses");
    }
    while (d > 0) { t.push_back({Kind::Rp, ")"}); --d; }
    return t;
}

class Parser {
public:
    const std::vector<Tok>& tokens;
    bool deg;
    size_t i = 0;
    Parser(const std::vector<Tok>& t, bool d) : tokens(t), deg(d) {}

    const Tok* peek() const { return i < tokens.size() ? &tokens[i] : nullptr; }

    bool isOp(const char* v) const {
        const Tok* t = peek();
        return t && t->kind == Kind::Op && t->v == v;
    }

    bool isPrimaryStart() const {
        const Tok* t = peek();
        if (!t) return false;
        return t->kind == Kind::Num || t->kind == Kind::Const || t->kind == Kind::Fn || t->kind == Kind::Lp;
    }

    const Tok& consume() {
        if (i >= tokens.size()) throw CalcError("Syntax error");
        return tokens[i++];
    }

    double parseExpr() {
        double v = parseTerm();
        while (isOp("+") || isOp("-")) {
            const std::string o = consume().v;
            const double r = parseTerm();
            v = (o == "+") ? v + r : v - r;
        }
        return v;
    }

    double parseTerm() {
        double v = parsePower();
        for (;;) {
            if (isOp("*") || isOp("/")) {
                const std::string o = consume().v;
                const double r = parsePower();
                if (o == "/") {
                    if (r == 0.0) throw CalcError("Cannot divide by zero");
                    v /= r;
                } else v *= r;
            } else if (isPrimaryStart()) {
                v *= parsePower();
            } else break;
        }
        return v;
    }

    double parsePower() {
        const double v = parseUnary();
        if (isOp("^")) { consume(); return std::pow(v, parsePower()); }
        if (isOp("r")) { consume(); return nthRoot(v, parsePower()); }
        return v;
    }

    double parseUnary() {
        if (isOp("-")) { consume(); return -parseUnary(); }
        if (isOp("+")) { consume(); return parseUnary(); }
        return parsePostfix();
    }

    double parsePostfix() {
        double v = parsePrimary();
        while (peek() && peek()->kind == Kind::Post) {
            const std::string p = consume().v;
            if (p == "!") {
                v = factorial(v);
                if (std::isnan(v)) throw CalcError("Invalid input");
            } else v = v / 100.0;
        }
        return v;
    }

    double parsePrimary() {
        const Tok* t = peek();
        if (!t) throw CalcError("Syntax error");
        if (t->kind == Kind::Num) {
            consume();
            try {
                const double n = std::stod(t->v);
                if (!std::isfinite(n)) throw CalcError("Invalid input");
                return n;
            } catch (const CalcError&) { throw; }
            catch (...) { throw CalcError("Invalid input"); }
        }
        if (t->kind == Kind::Const) {
            consume();
            return t->v == "pi" ? PI : EULER;
        }
        if (t->kind == Kind::Fn) {
            const std::string name = consume().v;
            double arg;
            if (peek() && peek()->kind == Kind::Lp) {
                consume();
                arg = parseExpr();
                if (!peek() || peek()->kind != Kind::Rp) throw CalcError("Mismatched parentheses");
                consume();
            } else {
                arg = parseUnary();
            }
            const double r = applyFn(name, arg, deg);
            if (std::isnan(r)) throw CalcError("Invalid input");
            if (!std::isfinite(r)) throw CalcError("Overflow");
            return r;
        }
        if (t->kind == Kind::Lp) {
            consume();
            const double v = parseExpr();
            if (!peek() || peek()->kind != Kind::Rp) throw CalcError("Mismatched parentheses");
            consume();
            return v;
        }
        throw CalcError("Syntax error");
    }
};

static double evaluate(const std::vector<Tok>& tokens, bool deg) {
    const std::vector<Tok> prepared = prepare(tokens);
    if (prepared.empty()) return 0.0;
    Parser p(prepared, deg);
    const double v = p.parseExpr();
    if (p.i != prepared.size()) throw CalcError("Syntax error");
    if (std::isnan(v)) throw CalcError("Invalid input");
    if (!std::isfinite(v)) throw CalcError("Overflow");
    return tidy(v);
}

class Engine {
public:
    std::vector<Tok> tokens;
    std::string display = "0";
    bool overwrite = true;
    double memory = 0;
    std::string error;
    std::string tape;
    bool deg = true;
    bool second = false;
    bool hyp = false;
    std::string pending;

    void paint(bool clearTape = true) {
        error.clear();
        second = false;
        display = formatTokens(tokens);
        if (display.empty()) display = "0";
        pending = (!tokens.empty() && tokens.back().kind == Kind::Op) ? tokens.back().v : "";
        if (clearTape) tape.clear();
    }

    void fail(const std::string& msg) {
        error = msg;
        display = "Error";
        overwrite = true;
        second = false;
        hyp = false;
    }

    void reset() {
        tokens.clear();
        display = "0";
        overwrite = true;
        error.clear();
        tape.clear();
        second = false;
        hyp = false;
        pending.clear();
    }

    void resetKeep() {
        const bool d = deg;
        const double m = memory;
        reset();
        deg = d;
        memory = m;
    }

    double currentNumeric() const {
        try { return evaluate(tokens, deg); }
        catch (...) {
            if (!tokens.empty() && tokens.back().kind == Kind::Num) {
                try { return std::stod(tokens.back().v); } catch (...) {}
            }
            return 0.0;
        }
    }

    void digit(char d) {
        if (!error.empty()) resetKeep();
        if (overwrite) tokens.clear();
        overwrite = false;
        if (!tokens.empty() && tokens.back().kind == Kind::Num) {
            std::string& v = tokens.back().v;
            if (v == "0") v = std::string(1, d);
            else if (v == "-0") v = std::string("-") + d;
            else {
                const auto epos = v.find_first_of("eE");
                if (epos != std::string::npos) {
                    int ed = 0;
                    for (size_t i = epos + 1; i < v.size(); ++i)
                        if (std::isdigit(static_cast<unsigned char>(v[i]))) ++ed;
                    if (ed >= 3) { second = false; return; }
                } else if (mantissaDigits(v) >= 14) { second = false; return; }
                v.push_back(d);
            }
        } else {
            pushImplicit(tokens);
            tokens.push_back({Kind::Num, std::string(1, d)});
        }
        paint();
    }

    void decimal() {
        if (!error.empty()) { resetKeep(); decimal(); return; }
        if (overwrite) tokens.clear();
        overwrite = false;
        if (!tokens.empty() && tokens.back().kind == Kind::Num) {
            std::string& v = tokens.back().v;
            if (v.find_first_of("eE") != std::string::npos || v.find('.') != std::string::npos) {
                second = false;
                return;
            }
            v.push_back('.');
        } else {
            pushImplicit(tokens);
            tokens.push_back({Kind::Num, "0."});
        }
        paint();
    }

    void insertOp(const std::string& o) {
        if (!error.empty()) return;
        if (overwrite) {
            if (!(tokens.size() == 1 && tokens[0].kind == Kind::Num)) tokens.clear();
        }
        overwrite = false;
        hyp = false;
        if (tokens.empty()) {
            if (o == "-") tokens.push_back({Kind::Op, "-"});
            else if (o == "+") { paint(); return; }
            else { second = false; return; }
        } else if (tokens.back().kind == Kind::Op) {
            tokens.back().v = o;
        } else if (tokens.back().kind == Kind::Lp) {
            if (o == "-") tokens.push_back({Kind::Op, "-"});
            else { second = false; return; }
        } else {
            tokens.push_back({Kind::Op, o});
        }
        paint();
    }

    void setOp(char o) {
        std::string s(1, o);
        if (o == 'r') s = "r";
        insertOp(s);
    }

    void paren(char which) {
        if (!error.empty()) return;
        if (which == '(') {
            if (overwrite) {
                if (tokens.size() == 1 && tokens[0].kind == Kind::Num) tokens.clear();
                else if (overwrite) tokens.clear();
            }
            overwrite = false;
            pushImplicit(tokens);
            tokens.push_back({Kind::Lp, "("});
        } else {
            if (overwrite) { second = false; return; }
            if (openParens(tokens) <= 0 || !endsComplete(tokens)) { second = false; return; }
            tokens.push_back({Kind::Rp, ")"});
        }
        paint();
    }

    void equals() {
        if (!error.empty()) return;
        try {
            std::vector<Tok> source = tokens.empty() ? std::vector<Tok>{{Kind::Num, "0"}} : tokens;
            const std::string expr = formatTokens(prepare(source));
            const double value = evaluate(source, deg);
            const std::string result = fmt(value);
            tokens = {{Kind::Num, result}};
            display = result;
            overwrite = true;
            error.clear();
            tape = expr;
            second = false;
            hyp = false;
            pending.clear();
        } catch (const CalcError& err) {
            fail(err.what());
        }
    }

    void clearEntry() {
        if (!error.empty() || overwrite || tokens.empty()) { resetKeep(); return; }
        tokens.clear();
        overwrite = true;
        paint();
        display = "0";
    }

    void sign() {
        if (!error.empty()) return;
        if (!tokens.empty() && tokens.back().kind == Kind::Num) {
            std::string& v = tokens.back().v;
            const auto epos = v.find_first_of("eE");
            if (epos != std::string::npos) {
                std::string head = v.substr(0, epos + 1);
                std::string exp = v.substr(epos + 1);
                if (!exp.empty() && exp[0] == '-') exp.erase(0, 1);
                else exp.insert(exp.begin(), '-');
                v = head + exp;
            } else if (!v.empty() && v[0] == '-') {
                v.erase(0, 1);
                if (v.empty()) v = "0";
            } else v.insert(v.begin(), '-');
            paint();
            return;
        }
        insertOp("-");
    }

    void percent() {
        if (!error.empty()) return;
        if (!endsComplete(tokens)) { second = false; return; }
        tokens.push_back({Kind::Post, "%"});
        overwrite = false;
        paint();
    }

    void backspace() {
        if (!error.empty() || overwrite) { second = false; return; }
        if (tokens.empty()) { overwrite = true; display = "0"; second = false; return; }
        Tok last = tokens.back();
        if (last.kind == Kind::Num && last.v.size() > 1) {
            last.v.pop_back();
            if (last.v == "-") last.v = "0";
            tokens.back() = last;
        } else {
            tokens.pop_back();
            if (last.kind == Kind::Lp && !tokens.empty() && tokens.back().kind == Kind::Fn)
                tokens.pop_back();
        }
        if (tokens.empty()) {
            overwrite = true;
            display = "0";
            pending.clear();
            second = false;
            tape.clear();
            return;
        }
        paint();
    }

    void memPlus()   { memory += currentNumeric(); second = false; }
    void memMinus()  { memory -= currentNumeric(); second = false; }
    void memClear()  { memory = 0; second = false; }
    void memRecall() {
        if (overwrite) tokens.clear();
        overwrite = false;
        pushImplicit(tokens);
        tokens.push_back({Kind::Num, fmt(memory)});
        paint();
    }

    void toggleSecond() { second = !second; }
    void toggleHyp()    { hyp = !hyp; }
    void toggleAngle()  { deg = !deg; second = false; }

    void insertFn(const std::string& name) {
        if (!error.empty()) return;
        std::vector<Tok> t = overwrite ? std::vector<Tok>{} : tokens;
        if (overwrite && tokens.size() == 1 && tokens[0].kind == Kind::Num) t = tokens;
        if (isSinglePrimary(t)) {
            t.insert(t.begin(), {Kind::Lp, "("});
            t.insert(t.begin(), {Kind::Fn, name});
            tokens = std::move(t);
            overwrite = false;
            hyp = false;
            paint();
            return;
        }
        pushImplicit(t);
        t.push_back({Kind::Fn, name});
        t.push_back({Kind::Lp, "("});
        tokens = std::move(t);
        overwrite = false;
        hyp = false;
        paint();
    }

    void constantPi() {
        if (overwrite) tokens.clear();
        overwrite = false;
        pushImplicit(tokens);
        tokens.push_back({Kind::Const, "pi"});
        paint();
    }
    void constantE() {
        if (overwrite) tokens.clear();
        overwrite = false;
        pushImplicit(tokens);
        tokens.push_back({Kind::Const, "e"});
        paint();
    }

    void ee() {
        if (!error.empty()) return;
        if (overwrite) { /* keep current number */ }
        if (!tokens.empty() && tokens.back().kind == Kind::Num &&
            tokens.back().v.find_first_of("eE") == std::string::npos) {
            tokens.back().v.push_back('e');
            overwrite = false;
            paint();
            return;
        }
        second = false;
    }

    std::string trigName(const char* base) const {
        const std::string b = base;
        if (hyp && second) return std::string("a") + b + "h";
        if (hyp) return b + std::string("h");
        if (second) return std::string("a") + b;
        return b;
    }

    void fnSin() { insertFn(trigName("sin")); }
    void fnCos() { insertFn(trigName("cos")); }
    void fnTan() { insertFn(trigName("tan")); }
    void fnLn()  { insertFn(second ? "exp" : "ln"); }
    void fnLog() { insertFn(second ? "exp10" : "log"); }
    void fnSqrt(){ insertFn(second ? "cbrt" : "sqrt"); }
    void fnPow() { insertOp("^"); }
    void fnNroot(){ insertOp("r"); }

    void fnSq() {
        if (!error.empty()) return;
        if (!endsComplete(tokens)) { second = false; return; }
        tokens.push_back({Kind::Op, "^"});
        tokens.push_back({Kind::Num, second ? "3" : "2"});
        overwrite = false;
        hyp = false;
        paint();
    }

    void fnInv() {
        if (!error.empty()) return;
        if (second) { insertFn("abs"); return; }
        std::vector<Tok> t = overwrite ? tokens : tokens;
        if (isSinglePrimary(t)) {
            t.insert(t.begin(), {Kind::Op, "/"});
            t.insert(t.begin(), {Kind::Num, "1"});
            t.insert(t.begin() + 2, {Kind::Lp, "("});
            t.push_back({Kind::Rp, ")"});
            tokens = std::move(t);
            overwrite = false;
            hyp = false;
            paint();
            return;
        }
        pushImplicit(t);
        t.push_back({Kind::Num, "1"});
        t.push_back({Kind::Op, "/"});
        t.push_back({Kind::Lp, "("});
        tokens = std::move(t);
        overwrite = false;
        hyp = false;
        paint();
    }

    void fnFact() {
        if (!error.empty()) return;
        if (!endsComplete(tokens)) { second = false; return; }
        tokens.push_back({Kind::Post, "!"});
        overwrite = false;
        hyp = false;
        paint();
    }
};

static char opFromChar(char c) {
    if (c == 'x' || c == 'X') return '*';
    return c;
}

static bool handleChar(Engine& e, char c) {
    if (c >= '0' && c <= '9') { e.digit(c); return true; }
    switch (c) {
        case '.': e.decimal(); return true;
        case '+': case '-': case '*': case '/':
            e.setOp(opFromChar(c));
            return true;
        case 'x': case 'X': e.setOp('*'); return true;
        case '^': e.setOp('^'); return true;
        case '(': e.paren('('); return true;
        case ')': e.paren(')'); return true;
        case '=': e.equals(); return true;
        case '%': e.percent(); return true;
        default: return false;
    }
}

static bool handleToken(Engine& e, const std::string& raw) {
    std::string t = raw;
    std::transform(t.begin(), t.end(), t.begin(),
                   [](unsigned char ch) { return static_cast<char>(std::tolower(ch)); });
    if (t == "q" || t == "quit" || t == "exit") return false;
    if (t == "ac" || t == "allclear") { e.resetKeep(); return true; }
    if (t == "c" || t == "clear") { e.clearEntry(); return true; }
    if (t == "s" || t == "+/-" || t == "sign") { e.sign(); return true; }
    if (t == "back" || t == "bs" || t == "bksp") { e.backspace(); return true; }
    if (t == "mc") { e.memClear(); return true; }
    if (t == "mr") { e.memRecall(); return true; }
    if (t == "m+") { e.memPlus(); return true; }
    if (t == "m-") { e.memMinus(); return true; }
    if (t == "2nd") { e.toggleSecond(); return true; }
    if (t == "hyp") { e.toggleHyp(); return true; }
    if (t == "deg" || t == "rad") { e.toggleAngle(); return true; }
    if (t == "pi") { e.constantPi(); return true; }
    if (t == "e" && raw.size() == 1) { e.constantE(); return true; }
    if (t == "ee" || t == "exp") { e.ee(); return true; }
    if (t == "sin") { e.fnSin(); return true; }
    if (t == "cos") { e.fnCos(); return true; }
    if (t == "tan") { e.fnTan(); return true; }
    if (t == "ln") { e.fnLn(); return true; }
    if (t == "log") { e.fnLog(); return true; }
    if (t == "sq" || t == "x2") { e.fnSq(); return true; }
    if (t == "sqrt") { e.fnSqrt(); return true; }
    if (t == "pow" || t == "x^n" || t == "x^y") { e.fnPow(); return true; }
    if (t == "nrt" || t == "nroot" || t == "yroot") { e.fnNroot(); return true; }
    if (t == "(" || t == "lp") { e.paren('('); return true; }
    if (t == ")" || t == "rp") { e.paren(')'); return true; }
    if (t == "inv" || t == "1/x") { e.fnInv(); return true; }
    if (t == "fact" || t == "n!" || t == "!") { e.fnFact(); return true; }
    if (t == "asin") { e.second = true; e.fnSin(); return true; }
    if (t == "acos") { e.second = true; e.fnCos(); return true; }
    if (t == "atan") { e.second = true; e.fnTan(); return true; }
    if (t == "help" || t == "h" || t == "?") {
        std::cout
            << "\nDigits:  0-9  + - * / ^  ( )  =  .  %\n"
            << "Clear:   c  ac  +/-  back  mc mr m+ m-\n"
            << "Sci:     sin cos tan ln log sq sqrt pow nrt inv fact pi e ee\n"
            << "         2nd  hyp  deg/rad  asin acos atan\n"
            << "Power:   2 pow 8 =     or   2^8=\n"
            << "Nth root: 3 nrt (8+19)=\n"
            << "Or type an expression:  (1+2)*3=\n\n";
        return true;
    }
    for (char c : raw) {
        if (c == ' ' || c == '\t') continue;
        handleChar(e, c);
    }
    return true;
}

static void drawTui(const Engine& e) {
    auto pad = [](const std::string& s, int w) {
        if ((int)s.size() >= w) return s.substr(s.size() - w);
        return std::string(w - (int)s.size(), ' ') + s;
    };
    std::string flags;
    if (e.second) flags += "2nd ";
    if (e.hyp) flags += "HYP ";
    flags += (e.deg ? "DEG" : "RAD");
    if (e.memory != 0.0) flags += " M";
    const int depth = openParens(e.tokens);
    if (depth > 0) flags += std::string(" ") + std::string(std::min(depth, 4), '(');
    const std::string top = pad(e.tape, 28);
    const std::string val = pad(e.display, 28);
    std::cout
        << "\n"
        << "  +------------------------------+\n"
        << "  | " << pad(flags, 28) << " |\n"
        << "  | " << top << " |\n"
        << "  | " << val << " |\n"
        << "  +------------------------------+\n"
        << "  | 2nd  hyp  Deg   pi    e      |\n"
        << "  | sin  cos  tan   ln    log    |\n"
        << "  | x^n  nrt  sqrt  x^2   n!     |\n"
        << "  |  (    )   1/x   EE    %      |\n"
        << "  | MC   MR   M+    M-           |\n"
        << "  |  C   +/-  back        /      |\n"
        << "  |  7    8    9           *     |\n"
        << "  |  4    5    6           -     |\n"
        << "  |  1    2    3           +     |\n"
        << "  |  0    .                =     |\n"
        << "  +------------------------------+\n";
    if (!e.error.empty()) std::cout << "  " << e.error << "\n";
    std::cout << "  button> " << std::flush;
}

static int runTui() {
    Engine e;
    std::cout << "Reckon — single-file scientific calculator  (type help, q to quit)\n";
    drawTui(e);
    std::string line;
    while (std::getline(std::cin, line)) {
        if (line.empty()) { drawTui(e); continue; }
        if (!handleToken(e, line)) break;
        drawTui(e);
    }
    std::cout << "\n";
    return 0;
}

#ifdef _WIN32
static Engine g_calc;
static HWND g_display = nullptr;
static HWND g_tape = nullptr;
static HWND g_flags = nullptr;
static HWND g_main = nullptr;
static HFONT g_font = nullptr;
static HFONT g_sciFont = nullptr;
static HFONT g_displayFont = nullptr;
static HBRUSH g_bg = nullptr;
static HBRUSH g_lcd = nullptr;

enum {
    ID_0 = 100, ID_1, ID_2, ID_3, ID_4, ID_5, ID_6, ID_7, ID_8, ID_9,
    ID_DOT, ID_PLUS, ID_MINUS, ID_MUL, ID_DIV, ID_EQ,
    ID_C, ID_SIGN, ID_PCT, ID_BACK,
    ID_MC, ID_MR, ID_MP, ID_MM,
    ID_2ND, ID_HYP, ID_DEG, ID_PI, ID_E, ID_EE,
    ID_SIN, ID_COS, ID_TAN, ID_LN, ID_LOG,
    ID_SQ, ID_SQRT, ID_POW, ID_INV, ID_FACT,
    ID_LP, ID_RP, ID_NROOT
};

static void refresh() {
    std::string flags;
    if (g_calc.second) flags += "2nd  ";
    if (g_calc.hyp) flags += "HYP  ";
    flags += g_calc.deg ? "DEG" : "RAD";
    if (g_calc.memory != 0.0) flags += "  M";
    const int depth = openParens(g_calc.tokens);
    if (depth > 0) {
        flags += "  ";
        flags.append(std::min(depth, 4), '(');
    }
    if (g_flags) SetWindowTextA(g_flags, flags.c_str());
    if (g_tape) SetWindowTextA(g_tape, g_calc.tape.c_str());
    if (g_display) SetWindowTextA(g_display, g_calc.display.c_str());
}

static void pressId(int id) {
    switch (id) {
        case ID_0: g_calc.digit('0'); break;
        case ID_1: g_calc.digit('1'); break;
        case ID_2: g_calc.digit('2'); break;
        case ID_3: g_calc.digit('3'); break;
        case ID_4: g_calc.digit('4'); break;
        case ID_5: g_calc.digit('5'); break;
        case ID_6: g_calc.digit('6'); break;
        case ID_7: g_calc.digit('7'); break;
        case ID_8: g_calc.digit('8'); break;
        case ID_9: g_calc.digit('9'); break;
        case ID_DOT: g_calc.decimal(); break;
        case ID_PLUS: g_calc.setOp('+'); break;
        case ID_MINUS: g_calc.setOp('-'); break;
        case ID_MUL: g_calc.setOp('*'); break;
        case ID_DIV: g_calc.setOp('/'); break;
        case ID_EQ: g_calc.equals(); break;
        case ID_C: g_calc.clearEntry(); break;
        case ID_SIGN: g_calc.sign(); break;
        case ID_PCT: g_calc.percent(); break;
        case ID_BACK: g_calc.backspace(); break;
        case ID_MC: g_calc.memClear(); break;
        case ID_MR: g_calc.memRecall(); break;
        case ID_MP: g_calc.memPlus(); break;
        case ID_MM: g_calc.memMinus(); break;
        case ID_2ND: g_calc.toggleSecond(); break;
        case ID_HYP: g_calc.toggleHyp(); break;
        case ID_DEG: g_calc.toggleAngle(); break;
        case ID_PI: g_calc.constantPi(); break;
        case ID_E: g_calc.constantE(); break;
        case ID_EE: g_calc.ee(); break;
        case ID_SIN: g_calc.fnSin(); break;
        case ID_COS: g_calc.fnCos(); break;
        case ID_TAN: g_calc.fnTan(); break;
        case ID_LN: g_calc.fnLn(); break;
        case ID_LOG: g_calc.fnLog(); break;
        case ID_SQ: g_calc.fnSq(); break;
        case ID_SQRT: g_calc.fnSqrt(); break;
        case ID_POW: g_calc.fnPow(); break;
        case ID_NROOT: g_calc.fnNroot(); break;
        case ID_LP: g_calc.paren('('); break;
        case ID_RP: g_calc.paren(')'); break;
        case ID_INV: g_calc.fnInv(); break;
        case ID_FACT: g_calc.fnFact(); break;
        default: break;
    }
    refresh();
}

static HWND makeBtn(HWND parent, const char* label, int id, int col, int row, bool sci) {
    const int pad = 12;
    const int top = 112;
    const int bw = 70;
    const int bh = 34;
    const int gap = 6;
    int x = pad + col * (bw + gap);
    int y = top + row * (bh + gap);
    HWND btn = CreateWindowA(
        "BUTTON", label,
        WS_CHILD | WS_VISIBLE | BS_PUSHBUTTON,
        x, y, bw, bh, parent, (HMENU)(INT_PTR)id,
        GetModuleHandleA(nullptr), nullptr);
    SendMessageA(btn, WM_SETFONT, (WPARAM)(sci ? g_sciFont : g_font), TRUE);
    return btn;
}

static void buildKeypad(HWND hwnd) {
    makeBtn(hwnd, "2nd", ID_2ND, 0, 0, true);
    makeBtn(hwnd, "hyp", ID_HYP, 1, 0, true);
    makeBtn(hwnd, "Deg", ID_DEG, 2, 0, true);
    makeBtn(hwnd, "pi",  ID_PI,  3, 0, true);
    makeBtn(hwnd, "e",   ID_E,   4, 0, true);

    makeBtn(hwnd, "sin", ID_SIN, 0, 1, true);
    makeBtn(hwnd, "cos", ID_COS, 1, 1, true);
    makeBtn(hwnd, "tan", ID_TAN, 2, 1, true);
    makeBtn(hwnd, "ln",  ID_LN,  3, 1, true);
    makeBtn(hwnd, "log", ID_LOG, 4, 1, true);

    makeBtn(hwnd, "x^n", ID_POW,   0, 2, true);
    makeBtn(hwnd, "nrt", ID_NROOT, 1, 2, true);
    makeBtn(hwnd, "sqrt",ID_SQRT,  2, 2, true);
    makeBtn(hwnd, "x^2", ID_SQ,    3, 2, true);
    makeBtn(hwnd, "n!",  ID_FACT,  4, 2, true);

    makeBtn(hwnd, "(",   ID_LP,  0, 3, true);
    makeBtn(hwnd, ")",   ID_RP,  1, 3, true);
    makeBtn(hwnd, "1/x", ID_INV, 2, 3, true);
    makeBtn(hwnd, "EE",  ID_EE,  3, 3, true);
    makeBtn(hwnd, "%",   ID_PCT, 4, 3, true);

    makeBtn(hwnd, "MC", ID_MC, 0, 4, true);
    makeBtn(hwnd, "MR", ID_MR, 1, 4, true);
    makeBtn(hwnd, "M+", ID_MP, 2, 4, true);
    makeBtn(hwnd, "M-", ID_MM, 3, 4, true);

    makeBtn(hwnd, "C",   ID_C,    0, 5, false);
    makeBtn(hwnd, "+/-", ID_SIGN, 1, 5, false);
    makeBtn(hwnd, "<-",  ID_BACK, 2, 5, false);
    makeBtn(hwnd, "/",   ID_DIV,  4, 5, false);

    makeBtn(hwnd, "7", ID_7, 0, 6, false);
    makeBtn(hwnd, "8", ID_8, 1, 6, false);
    makeBtn(hwnd, "9", ID_9, 2, 6, false);
    makeBtn(hwnd, "*", ID_MUL, 4, 6, false);

    makeBtn(hwnd, "4", ID_4, 0, 7, false);
    makeBtn(hwnd, "5", ID_5, 1, 7, false);
    makeBtn(hwnd, "6", ID_6, 2, 7, false);
    makeBtn(hwnd, "-", ID_MINUS, 4, 7, false);

    makeBtn(hwnd, "1", ID_1, 0, 8, false);
    makeBtn(hwnd, "2", ID_2, 1, 8, false);
    makeBtn(hwnd, "3", ID_3, 2, 8, false);
    makeBtn(hwnd, "+", ID_PLUS, 4, 8, false);

    makeBtn(hwnd, "0", ID_0, 0, 9, false);
    makeBtn(hwnd, ".", ID_DOT, 1, 9, false);
    makeBtn(hwnd, "=", ID_EQ, 4, 9, false);
}

static bool handleKey(WPARAM vk) {
    if (vk >= '0' && vk <= '9') { g_calc.digit((char)vk); refresh(); return true; }
    switch (vk) {
        case VK_NUMPAD0: g_calc.digit('0'); refresh(); return true;
        case VK_NUMPAD1: g_calc.digit('1'); refresh(); return true;
        case VK_NUMPAD2: g_calc.digit('2'); refresh(); return true;
        case VK_NUMPAD3: g_calc.digit('3'); refresh(); return true;
        case VK_NUMPAD4: g_calc.digit('4'); refresh(); return true;
        case VK_NUMPAD5: g_calc.digit('5'); refresh(); return true;
        case VK_NUMPAD6: g_calc.digit('6'); refresh(); return true;
        case VK_NUMPAD7: g_calc.digit('7'); refresh(); return true;
        case VK_NUMPAD8: g_calc.digit('8'); refresh(); return true;
        case VK_NUMPAD9: g_calc.digit('9'); refresh(); return true;
        case VK_OEM_PERIOD:
        case VK_DECIMAL: g_calc.decimal(); refresh(); return true;
        case VK_ADD: case 0xBB: g_calc.setOp('+'); refresh(); return true;
        case VK_SUBTRACT: case 0xBD: g_calc.setOp('-'); refresh(); return true;
        case VK_MULTIPLY: g_calc.setOp('*'); refresh(); return true;
        case VK_DIVIDE: case 0xBF: g_calc.setOp('/'); refresh(); return true;
        case VK_RETURN: case VK_SEPARATOR: g_calc.equals(); refresh(); return true;
        case VK_ESCAPE: g_calc.resetKeep(); refresh(); return true;
        case VK_BACK: g_calc.backspace(); refresh(); return true;
        case VK_DELETE: g_calc.clearEntry(); refresh(); return true;
        default: return false;
    }
}

static LRESULT CALLBACK WndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam) {
    switch (msg) {
        case WM_CREATE: {
            g_bg = CreateSolidBrush(RGB(30, 28, 25));
            g_lcd = CreateSolidBrush(RGB(210, 220, 203));
            g_font = CreateFontA(16, 0, 0, 0, FW_MEDIUM, FALSE, FALSE, FALSE,
                DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS,
                CLEARTYPE_QUALITY, DEFAULT_PITCH | FF_SANS, "Segoe UI");
            g_sciFont = CreateFontA(13, 0, 0, 0, FW_MEDIUM, FALSE, FALSE, FALSE,
                DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS,
                CLEARTYPE_QUALITY, DEFAULT_PITCH | FF_SANS, "Segoe UI");
            g_displayFont = CreateFontA(26, 0, 0, 0, FW_SEMIBOLD, FALSE, FALSE, FALSE,
                DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS,
                CLEARTYPE_QUALITY, FIXED_PITCH | FF_MODERN, "Consolas");

            g_flags = CreateWindowA("STATIC", "DEG",
                WS_CHILD | WS_VISIBLE | SS_LEFT,
                20, 16, 360, 16, hwnd, nullptr, GetModuleHandleA(nullptr), nullptr);
            SendMessageA(g_flags, WM_SETFONT, (WPARAM)g_sciFont, TRUE);

            g_tape = CreateWindowA("STATIC", "",
                WS_CHILD | WS_VISIBLE | SS_RIGHT,
                20, 34, 360, 16, hwnd, nullptr, GetModuleHandleA(nullptr), nullptr);
            SendMessageA(g_tape, WM_SETFONT, (WPARAM)g_sciFont, TRUE);

            g_display = CreateWindowA("STATIC", "0",
                WS_CHILD | WS_VISIBLE | SS_RIGHT,
                20, 52, 360, 46, hwnd, nullptr, GetModuleHandleA(nullptr), nullptr);
            SendMessageA(g_display, WM_SETFONT, (WPARAM)g_displayFont, TRUE);

            buildKeypad(hwnd);
            return 0;
        }
        case WM_COMMAND:
            pressId(LOWORD(wParam));
            SetFocus(hwnd);
            return 0;
        case WM_CHAR: {
            char c = (char)wParam;
            if (c == '=' || c == '%' || c == '^' || c == '+' || c == '-' ||
                c == '*' || c == '/' || c == 'x' || c == 'X' || c == '.' ||
                c == '(' || c == ')') {
                handleChar(g_calc, c);
                refresh();
            }
            return 0;
        }
        case WM_KEYDOWN:
            if (handleKey(wParam)) return 0;
            break;
        case WM_CTLCOLORSTATIC: {
            HDC hdc = (HDC)wParam;
            SetBkColor(hdc, RGB(210, 220, 203));
            SetTextColor(hdc, RGB(28, 36, 24));
            return (LRESULT)g_lcd;
        }
        case WM_ERASEBKGND: {
            RECT rc;
            GetClientRect(hwnd, &rc);
            FillRect((HDC)wParam, &rc, g_bg);
            RECT lcd = {12, 12, 392, 104};
            FillRect((HDC)wParam, &lcd, g_lcd);
            return 1;
        }
        case WM_DESTROY:
            if (g_font) DeleteObject(g_font);
            if (g_sciFont) DeleteObject(g_sciFont);
            if (g_displayFont) DeleteObject(g_displayFont);
            if (g_bg) DeleteObject(g_bg);
            if (g_lcd) DeleteObject(g_lcd);
            PostQuitMessage(0);
            return 0;
    }
    return DefWindowProcA(hwnd, msg, wParam, lParam);
}

static int runWin32() {
    HINSTANCE hi = GetModuleHandleA(nullptr);
    const char* cls = "ReckonCalcWnd";
    WNDCLASSA wc{};
    wc.lpfnWndProc = WndProc;
    wc.hInstance = hi;
    wc.lpszClassName = cls;
    wc.hCursor = LoadCursor(nullptr, IDC_ARROW);
    wc.hIcon = LoadIcon(nullptr, IDI_APPLICATION);
    wc.hbrBackground = (HBRUSH)(COLOR_WINDOW + 1);
    if (!RegisterClassA(&wc)) return 1;

    const int w = 404;
    const int h = 530;
    RECT r = {0, 0, w, h};
    AdjustWindowRect(&r, WS_OVERLAPPED | WS_CAPTION | WS_SYSMENU | WS_MINIMIZEBOX, FALSE);

    g_main = CreateWindowA(
        cls, "Reckon",
        WS_OVERLAPPED | WS_CAPTION | WS_SYSMENU | WS_MINIMIZEBOX,
        CW_USEDEFAULT, CW_USEDEFAULT,
        r.right - r.left, r.bottom - r.top,
        nullptr, nullptr, hi, nullptr);
    if (!g_main) return 1;
    ShowWindow(g_main, SW_SHOW);
    UpdateWindow(g_main);
    SetFocus(g_main);

    MSG msg;
    while (GetMessageA(&msg, nullptr, 0, 0) > 0) {
        TranslateMessage(&msg);
        DispatchMessageA(&msg);
    }
    return (int)msg.wParam;
}
#endif

int main() {
#ifdef _WIN32
    return runWin32();
#else
    return runTui();
#endif
}
