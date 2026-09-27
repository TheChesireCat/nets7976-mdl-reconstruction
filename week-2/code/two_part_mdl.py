#!/usr/bin/env python3
"""
Crude two-part code MDL, and what it cannot see.

Grunwald (2004), Sec. 1.2.2: a practical description method C must be restrictive
enough that the shortest codelength under C is computable, but that restriction has
a price -- "there will always be some regular sequences which we will not be able
to compress."

This script makes the price concrete. Two model classes C from the tutorial:

  markov      C = Markov chains of order 0..K            (Sec. 2.3, Example 2.8)
  polynomial  C = polynomials of degree 0..D + Gaussian  (Sec. 1.3, Example 1.1)

Each is run against a MATCHED source (the regularity is expressible in C, so MDL
finds it and compresses) and a MISMATCHED source (the regularity is real, short to
describe, and simply has no name in C's language, so MDL finds nothing).

The mismatched cases are not noise. The digits of pi are Example 1.1's own paradigm
of an "extremely regular" sequence, with Kolmogorov complexity O(log n). A sine wave
is one line of code. Both are invisible to a C that cannot express them.

WHAT A TWO-PART CODELENGTH IS
-----------------------------
Every codelength below has the shape L(H) + L(D | H), where H is a hypothesis:

    L(H)       bits to describe the hypothesis: which model structure (Markov
               order k, polynomial degree d) and what its parameter values are.
    L(D | H)   bits to describe the data once the receiver already knows H.
               By Grunwald Sec. 2.4.1 this is FORCED to be -log2 P(D | H), the
               negative log-likelihood. There is no freedom in this term.

MDL then picks the structure minimizing the sum. L(D|H) always falls as the model
grows richer (more parameters can only fit better), so all resistance to
overfitting comes from L(H) growing faster.

Usage:
    python3 two_part_mdl.py markov
    python3 two_part_mdl.py polynomial
    python3 two_part_mdl.py both            # default
    python3 two_part_mdl.py markov --n 50000 --max-order 14
"""

import argparse
import math

import numpy as np

# --------------------------------------------------------------------------
# Universal code for the integers (Elias gamma), used for model indices.
# Codelength only -- we never need the actual codewords.
# --------------------------------------------------------------------------


def elias_gamma_bits(m: int) -> float:
    """Length in bits of the Elias gamma code for integer m >= 1.

    This is Grunwald's Example 2.4, the "simple standard code for the integers",
    whose length he quotes as 2 log k + 1 bits.

    WHY WE NEED IT AT ALL: we must tell the receiver which model we picked (which
    Markov order, which polynomial degree) without any pre-agreed upper bound on
    that number. Plain binary will not do -- it is not prefix-free, so the decoder
    could not tell where the index stops and the data begins. Elias gamma fixes
    that by sending the LENGTH first in unary, then the value in binary:

        m = 5 -> floor(log2 5) = 2 -> "00" + "1" + "101"  = 7 bits
                                       ^^^^   ^^^  ^^^^^
                                       length  end  value

    Total 2*floor(log2 m) + 1 bits, which is the formula below. The doubling is
    the price of self-delimitation: you pay for the number once to say how long
    it is, once to say what it is.

    Returns a float (not int) only so it adds cleanly to the other float terms.
    """
    if m < 1:
        raise ValueError("Elias gamma is defined for m >= 1")
    return 2 * math.floor(math.log2(m)) + 1


def zigzag(i: int) -> int:
    """Map a signed integer onto the positive integers, for Elias gamma.

    Elias gamma is only defined for m >= 1, but quantized polynomial coefficients
    are signed and can be zero. This interleaves the two signs onto 1, 2, 3, ...:

        i    :  0   -1   1   -2   2   -3   3
        out  :  1    2   3    4   5    6   7

    so every integer gets a distinct positive image, and small magnitudes stay
    small (hence cheap to code).
    """
    return 2 * i + 1 if i >= 0 else -2 * i


# ==========================================================================
# Sources
# ==========================================================================


def pi_bits(nbits: int) -> np.ndarray:
    """Binary expansion of the fractional part of pi, via Machin's formula.

    Kolmogorov complexity of the output: the length of this function, plus
    O(log n) for n. A few hundred bits, independent of nbits.

    That last sentence is the entire reason this source exists. Whatever this
    function returns, a program of fixed size printed it -- so the sequence is
    maximally regular in the Kolmogorov sense. We then watch the Markov model
    class fail to find any of that regularity.

    Machin's formula:  pi = 16 * arctan(1/5) - 4 * arctan(1/239).

    EVERYTHING HERE IS EXACT INTEGER ARITHMETIC, not floating point: we need tens
    of thousands of correct bits, and a float64 carries 53. The trick is to work
    with pi * 2^prec as a Python int (Python ints are arbitrary precision), so a
    "fractional" value is represented by its numerator over the implied 2^prec.
    `prec` is nbits + 64 to leave slack for rounding error to accumulate in bits
    we will throw away.
    """
    prec = nbits + 64
    one = 1 << prec  # the number 1.0, in this fixed-point representation

    def atan_inv(x: int) -> int:
        """arctan(1/x), scaled by 2^prec.

        Taylor series: arctan(1/x) = 1/x - 1/(3x^3) + 1/(5x^5) - ...
        `term` holds 1/x^(2j+1) scaled by 2^prec, and is divided by x^2 each
        pass. `denom` is the 1, 3, 5, ... divisor. The loop ends when integer
        division drives `term` to 0, i.e. when the next term is below the
        precision we are carrying -- so it self-terminates at full accuracy.
        """
        total, term, xsq, denom = 0, one // x, x * x, 1
        while term:
            total += term // denom if denom % 2 == 1 else -(term // denom)
            term //= xsq
            denom += 2
        return total

    pi_scaled = 4 * (4 * atan_inv(5) - atan_inv(239))
    frac = pi_scaled - (3 << prec)  # strip the integer part 3, keep 0.14159...

    # Extract bit i of the fraction: shift it down to position 0 and mask.
    # Bit 0 of the fraction sits at position prec-1, bit 1 at prec-2, and so on.
    return np.array(
        [(frac >> (prec - 1 - i)) & 1 for i in range(nbits)], dtype=np.int8
    )


def markov_bits(nbits: int, order: int = 3, seed: int = 0) -> np.ndarray:
    """A genuine order-k Markov chain: the regularity C is built to express."""
    rng = np.random.default_rng(seed)
    # Sharply peaked transition probabilities so the structure is easy to detect.
    # Beta(0.25, 0.25) is U-shaped -- it puts most of its mass near 0 and near 1,
    # so each context predicts its next bit nearly deterministically. A uniform
    # draw would give thetas near 0.5, which is almost indistinguishable from a
    # fair coin and would make the structure undetectable at this n.
    theta = rng.beta(0.25, 0.25, size=1 << order)
    x = rng.integers(0, 2, size=order).astype(np.int8)  # seed the first k bits
    out = list(x)
    for _ in range(nbits - order):
        # Pack the last `order` emitted bits into an integer naming the context,
        # most significant bit first. Same construction as in markov_codelength,
        # written scalar here because this loop is inherently sequential.
        ctx = 0
        for b in out[-order:]:
            ctx = (ctx << 1) | int(b)
        out.append(int(rng.random() < theta[ctx]))
    return np.array(out, dtype=np.int8)


def periodic_bits(nbits: int, pattern=(0, 0, 0, 1)) -> np.ndarray:
    """Grunwald's sequence (1): 00010001... Matched -- it *is* an order-3 chain.

    With 3 bits of context the next bit is fully determined, so an order-3 chain
    can drive L(x | theta) to exactly zero. This is the easy case, included as a
    positive control: if MDL failed here, the implementation would be wrong.
    """
    reps = nbits // len(pattern) + 1  # +1 so slicing never runs short
    return np.array((list(pattern) * reps)[:nbits], dtype=np.int8)


def iid_bits(nbits: int, seed: int = 0) -> np.ndarray:
    """Fair coin flips. Grunwald's sequence (2): incompressible, and truly so.

    The negative control. Unlike pi, this sequence really has no structure --
    K(D) ~ n. MDL should decline to compress it, and the interesting result is
    that it scores this within a couple of bits of the pi row.
    """
    return np.random.default_rng(seed).integers(0, 2, size=nbits).astype(np.int8)


def newton_data(n: int, seed: int = 0):
    """Example 1.1's physics table: drop heights vs. fall times, t = sqrt(2h/g).

    Recorded as a quadratic in t, which is exactly degree 2 -- inside C.
    """
    rng = np.random.default_rng(seed)
    t = np.linspace(0.1, 3.0, n)
    h = 0.5 * 9.81 * t**2
    return t, h + rng.normal(0, 0.05, size=n)


def sine_data(n: int, omega: float = 40.0, seed: int = 0):
    """y = sin(omega * x) over many periods. One line of code; not a polynomial.

    Weierstrass guarantees polynomials approximate this eventually, but the degree
    needed grows with omega, and the two-part cost of those coefficients outruns
    the gain in fit long before the fit is any good.

    Lower --omega and the failure becomes a matter of degree rather than kind:
    around omega ~ 3 the sine fits inside a low-degree polynomial and MDL finds it.
    """
    rng = np.random.default_rng(seed)
    x = np.linspace(-1.0, 1.0, n)
    return x, np.sin(omega * x) + rng.normal(0, 0.05, size=n)


# ==========================================================================
# C = Markov chains.  Two-part code following Grunwald, Example 2.8.
# ==========================================================================


def markov_codelength(x: np.ndarray, k: int):
    """L(k) + L(theta_hat | k) + L(x | theta_hat), in bits.

    NOTATION used throughout this function:

        context   a specific string of k consecutive bits. There are 2^k of them.
        s         an integer NAMING a context: read its k bits as a binary
                  number. For k=3 the context 101 is s = 5. Range 0 .. 2^k - 1.
        b         a bit value, 0 or 1 -- the symbol being PREDICTED, i.e. the one
                  that follows a context.
        counts[s][b]   how many times bit b followed context s in x.
        totals[s]      counts[s][0] + counts[s][1], i.e. how often context s
                       occurred at all.

    An order-k chain has one parameter per context: theta_s = P(next bit is 1 |
    context s). So theta is a vector of 2^k numbers -- those are the k' = 2^k
    parameters the parameter cost pays for. Its maximum-likelihood value is the
    observed frequency, theta_hat_s = counts[s][1] / totals[s], and therefore

        P(b | s, theta_hat) = counts[s][b] / totals[s]

    for either value of b. That identity is why the code below never builds
    theta_hat explicitly -- it reads the probabilities straight off the counts.
    """
    n = len(x)
    # 2^k, the number of distinct contexts. ("states" is the Markov-chain word
    # for the same thing; this script otherwise says "context".)
    n_states = 1 << k

    # Conditional counts. Context = the k preceding bits, most significant first.
    counts = np.zeros((n_states, 2), dtype=np.int64)
    if k == 0:
        # Order 0 is the Bernoulli model: no context, one single bucket, so the
        # counts are just the global tallies of 0s and 1s. (The general branch
        # below happens to handle k=0 correctly too -- its loop body never runs
        # and ctx stays all-zero -- so this case is written out only for clarity.)
        counts[0, 0] = int((x == 0).sum())
        counts[0, 1] = int((x == 1).sum())
    else:
        # Build ctx: one integer per prediction position. There are n-k positions;
        # index them by t = 0 .. n-k-1. Position t predicts x[k+t], and its
        # context is the k bits x[t] .. x[t+k-1]. So we want
        #
        #     ctx[t] = the integer whose bits are x[t], x[t+1], ..., x[t+k-1]
        #
        # The readable way to compute that is a loop over positions:
        #
        #     for t in range(n - k):
        #         s = 0
        #         for j in range(k):
        #             s = (s << 1) | x[t + j]      # append one bit, MSB first
        #         counts[s][x[t + k]] += 1
        #
        # The version below is that with the two loops SWAPPED: the outer loop
        # runs over j (the bit position within a context, at most ~12 passes)
        # and numpy handles all t at once. Each pass appends one more bit to
        # every context integer simultaneously. `x[j : n-k+j]` is "the j-th bit
        # of every context", offset by j because context t begins at x[t].
        #
        # On arrays, `<<` and `|` are ELEMENTWISE -- nothing moves between array
        # slots; each entry's own bits shift within that entry. Since shifting
        # left always leaves the low bit at 0, OR-ing a 0/1 value in is the same
        # as adding it, so this line is exactly  ctx = ctx * 2 + slice: building
        # a binary number one digit at a time, the way you read 3 -> 34 -> 347.
        ctx = np.zeros(n - k, dtype=np.int64)
        for j in range(k):
            ctx = (ctx << 1) | x[j : n - k + j]
        # Tally one (context, next-bit) pair per position. MUST be np.add.at and
        # not `counts[ctx, x[k:]] += 1`: the latter uses buffered fancy indexing
        # and would count each REPEATED index only once. Contexts repeat
        # constantly, so that version silently produces wrong counts.
        np.add.at(counts, (ctx, x[k:]), 1)

    # L(x | theta_hat): log-loss of the maximum-likelihood chain.
    #
    # Summing -log2 P(x_i | context) over positions, then grouping identical
    # (s, b) pairs -- each contributes the same term counts[s][b] times -- gives
    #
    #     L(x | theta_hat) = - sum_s sum_b counts[s][b] * log2(counts[s][b]/totals[s])
    #
    # i.e. (n-k) times the empirical conditional entropy. Note this can only
    # DECREASE as k grows: more context can only fit better. Nothing here resists
    # overfitting; that is entirely the job of param_bits below.
    #
    # keepdims=True gives totals shape (n_states, 1) so it broadcasts against
    # counts of shape (n_states, 2).
    totals = counts.sum(axis=1, keepdims=True)
    # NOTE: this errstate is redundant as written -- the two np.maximum floors
    # below already prevent every 0/0 and log2(0), so nothing ever warns. It
    # would be needed for the alternative style that computes the bad values and
    # masks them afterwards (`counts / totals`, `np.log2(probs)`), because
    # np.where evaluates BOTH branches eagerly. Kept here only as a belt on top
    # of braces; one guard or the other is enough, not both.
    with np.errstate(divide="ignore", invalid="ignore"):
        # Unvisited contexts (totals == 0) really do occur: at k=12 there are
        # 4096 contexts and only ~20000 samples. maximum(totals, 1) keeps the
        # division finite; the np.where then assigns them probability 1.0 so
        # they contribute log2(1) = 0.
        probs = np.where(totals > 0, counts / np.maximum(totals, 1), 1.0)
        # `counts > 0` implements the 0 * log 0 = 0 convention. A VISITED context
        # where only one symbol ever appeared has counts == 0 for the other
        # symbol, giving probs == 0 and log2(0) = -inf -- but that term should be
        # zero, since it happened zero times. maximum(probs, 1e-300) keeps the
        # eagerly-evaluated log2 finite at those masked-out positions.
        terms = np.where(counts > 0, counts * np.log2(np.maximum(probs, 1e-300)), 0.0)
    data_bits = -terms.sum()

    # L(theta_hat | k): one frequency per state, uniform code, k' log(n+1) bits.
    #
    # Example 2.8: given n, each of the k' = 2^k conditional counts lies in the
    # (n+1)-element set {0, ..., n}, so a fixed-length code spends log2(n+1) bits
    # on each. Note n_states IS k' = 2^k, so this term grows EXPONENTIALLY in the
    # order -- doubling with every increment of k. That explosion is what stops
    # MDL from running away to high orders.
    #
    # (Grunwald's displayed equations for this -- the L(P) line in Example 2.8
    # and eq. 2.9 -- drop the prime and print "k log(n+1)". His prose has it
    # right. The prose is correct: it is k', not k.)
    #
    # This crude 1/n-resolution grid is also twice as expensive as it needs to
    # be: refined MDL charges (k'/2) log n, because parameters estimated from n
    # samples cannot be resolved more finely than 1/sqrt(n) anyway.
    param_bits = n_states * math.log2(n + 1)
    # L(k), plus the first k bits verbatim (no context available for them).
    # The counts loop above only covers x[k:], so those k bits are unmodelled;
    # charging 1 bit each makes the total a complete code for all n bits, which
    # is what makes comparison against the n-bit literal baseline honest.
    model_bits = elias_gamma_bits(k + 1) + k
    # k+1 because Elias gamma needs m >= 1 while k = 0 is a legal order.

    return {
        "index": k,
        "model": model_bits,
        "params": param_bits,
        "data": data_bits,
        "total": model_bits + param_bits + data_bits,
    }


def run_markov(n: int, max_order: int):
    # Literal encoding: write the sequence out verbatim, 1 bit per symbol. Any
    # total above this means the "compression" scheme lost.
    baseline = float(n)  # literal encoding: n bits
    sources = [
        ("pi", "MISMATCHED", "binary digits of pi", lambda: pi_bits(n)),
        ("periodic", "matched", "0001 repeated (Grunwald seq. 1)", lambda: periodic_bits(n)),
        ("markov", "matched", "true order-3 Markov chain", lambda: markov_bits(n, 3)),
        ("iid", "control", "fair coin flips (Grunwald seq. 2)", lambda: iid_bits(n)),
    ]

    print("=" * 74)
    print("C = MARKOV CHAINS of order 0..%d   (Grunwald Sec. 2.3, Example 2.8)" % max_order)
    print("n = %d bits;  literal encoding = %d bits" % (n, n))
    print("=" * 74)

    summary = {}
    for name, kind, desc, make in sources:
        x = make()
        # Score every order in the class and let the minimum speak. The whole
        # curve is printed, not just the argmin, because the SHAPE is the lesson:
        # L(x|theta) sliding down while L(theta) explodes.
        rows = [markov_codelength(x, k) for k in range(max_order + 1)]
        best = min(rows, key=lambda r: r["total"])
        summary[name] = best

        print("\n  source: %s  [%s]  -- %s" % (name, kind, desc))
        print("  %7s %12s %12s %12s %12s" % ("order k", "L(theta)", "L(x|theta)", "total", "vs literal"))
        for r in rows:
            mark = "  <-- MDL" if r["index"] == best["index"] else ""
            # The table shows L(theta) and L(x|theta) but not model_bits -- that
            # term is single-digit bits here and only appears inside "total".
            print(
                "  %7d %12.1f %12.1f %12.1f %+12.1f%s"
                % (r["index"], r["params"], r["data"], r["total"], r["total"] - baseline, mark)
            )
        saved = baseline - best["total"]
        verdict = (
            "compressed by %.1f bits (%.1f%%)" % (saved, 100 * saved / baseline)
            if saved > 0
            else "NOT COMPRESSED (%.1f bits worse than literal)" % (-saved)
        )
        print("  => MDL picks k = %d: %s" % (best["index"], verdict))

    print("\n  " + "-" * 70)
    print("  The point: compare the two incompressible rows.")
    print("    pi   -> MDL codelength %10.1f bits    (K(D) = O(log n), a few hundred bits)"
          % summary["pi"]["total"])
    print("    coin -> MDL codelength %10.1f bits    (K(D) ~ n = %d bits)"
          % (summary["iid"]["total"], n))
    # 300 is a rough stand-in for K(pi digits) -- the size of pi_bits() plus
    # O(log n) for n, in bits. Only the order of magnitude matters here.
    print("  Two sequences whose Kolmogorov complexities differ by a factor of ~%d,"
          % (n // 300))
    print("  and this C scores them within %.1f bits of each other. The regularity in pi"
          % abs(summary["pi"]["total"] - summary["iid"]["total"]))
    print("  is total, and C's language has no word for it.")
    print("  " + "-" * 70)


# ==========================================================================
# C = polynomials + Gaussian noise.  Two-part code.
# ==========================================================================


def polynomial_codelength(x: np.ndarray, y: np.ndarray, d: int):
    """L(d) + L(coeffs, sigma | d) + L(y | coeffs, sigma), in bits.

    Coefficients are quantized to a grid of width 1/sqrt(n) -- the standard crude
    choice -- and their indices sent with a universal code for the integers.

    L(y | .) omits the n * log2(1/eps) term for the precision to which y is
    recorded. That term is identical for every d, so it cannot affect the argmin.

    WHY QUANTIZE AT ALL: a real-valued coefficient carries infinitely many bits,
    so it cannot be transmitted. A two-part code has to round it to a grid and
    pay for the grid index. WHY 1/sqrt(n) SPECIFICALLY: a parameter estimated
    from n samples has standard error ~1/sqrt(n), so resolution finer than that
    buys no improvement in fit while costing real bits. This is the same
    reasoning that turns Grunwald's eq. (2.8) into eq. (2.9).

    A CONSEQUENCE OF THE DROPPED CONSTANT: because the n*log2(1/eps) term is
    omitted, the totals printed for this model class can be NEGATIVE. They are
    comparable to each other but not to any absolute bit count -- unlike the
    Markov numbers, which are absolute and comparable to n.
    """
    n = len(x)

    # Work in u = (x - mid) / half, which maps the x-range onto [-1, 1]. This
    # rescaling is part of the definition of C, fixed before seeing y, and keeps
    # the least-squares fit well conditioned at high degree.
    #
    # Without it, fitting degree 20 on raw x involves powers spanning many orders
    # of magnitude and the normal equations become numerically hopeless. Note the
    # map depends only on x, never on y, so it smuggles in no information about
    # the thing being predicted.
    mid = 0.5 * (x.max() + x.min())
    # `or 1.0` catches the degenerate case of constant x, where the span is 0 and
    # the division would blow up. In Python, `0.0 or 1.0` evaluates to 1.0.
    half = 0.5 * (x.max() - x.min()) or 1.0
    u = (x - mid) / half

    # Least-squares fit of degree d. NOTE the convention: this function
    # (np.polynomial.polynomial.polyfit) returns coefficients in INCREASING power
    # order, c0 + c1*u + c2*u^2 + ... The older np.polyfit returns them in
    # decreasing order. polyval below expects the increasing convention, so the
    # two must be kept consistent.
    coeffs = np.polynomial.polynomial.polyfit(u, y, d)

    # Quantize, then score the QUANTIZED model -- a two-part code must decode to
    # what the receiver actually gets, not to the unrounded least-squares fit.
    delta = 1.0 / math.sqrt(n)
    idx = np.round(coeffs / delta).astype(np.int64)  # grid indices (signed)
    q_coeffs = idx * delta  # the coefficients the receiver reconstructs
    # Cost of transmitting those indices: zigzag them onto the positive integers,
    # then charge the Elias gamma length for each. Coefficients near zero land on
    # small indices and are cheap, which is the intended behaviour.
    param_bits = sum(elias_gamma_bits(zigzag(int(i))) for i in idx)

    # Residuals against the QUANTIZED fit, so rss reflects what the receiver can
    # actually reconstruct.
    resid = y - np.polynomial.polynomial.polyval(u, q_coeffs)
    rss = float(np.dot(resid, resid))  # sum of squared residuals

    # sigma is a parameter too: quantize it and charge for it.
    # A Gaussian model has a noise scale as well as a mean function, and pretending
    # otherwise would understate L(H). Plug-in ML estimate is sqrt(rss/n); it is
    # floored at delta so a perfect fit cannot drive sigma to 0 (log2(0) = -inf)
    # and so its grid index stays >= 1 for Elias gamma.
    sigma = max(math.sqrt(rss / n), delta)
    s_idx = max(int(round(sigma / delta)), 1)
    sigma_q = s_idx * delta
    param_bits += elias_gamma_bits(s_idx)

    # Gaussian log-loss, in bits, at the quantized sigma.
    #
    # For one point, P(y_i) = exp(-r_i^2 / 2 sigma^2) / sqrt(2 pi sigma^2), so
    #
    #     -log2 P(y_i) = (1/2) log2(2 pi sigma^2) + (r_i^2 / 2 sigma^2) * log2(e)
    #
    # and summing over i gives the two terms below. The log2(e) factor converts
    # the natural-log exponent into bits (log2(exp(z)) = z * log2 e); forgetting
    # it is the classic error in this formula.
    data_bits = n / 2 * math.log2(2 * math.pi * sigma_q**2) + rss / (
        2 * sigma_q**2
    ) * math.log2(math.e)
    model_bits = elias_gamma_bits(d + 1)  # L(d); d+1 since gamma needs m >= 1

    return {
        "index": d,
        "model": model_bits,
        "params": param_bits,
        "data": data_bits,
        "total": model_bits + param_bits + data_bits,
        "rms": math.sqrt(rss / n),  # reported for interpretation, not coding
    }


def run_polynomial(n: int, max_degree: int, omega: float):
    sources = [
        ("sine", "MISMATCHED", "y = sin(%.0f x)" % omega, lambda: sine_data(n, omega)),
        ("newton", "matched", "Example 1.1 physics table, h = g t^2 / 2", lambda: newton_data(n)),
    ]

    print("\n" + "=" * 74)
    print("C = POLYNOMIALS of degree 0..%d + Gaussian noise  (Grunwald Sec. 1.3)" % max_degree)
    print("n = %d points;  baseline = the d=0 (no-structure) codelength" % n)
    print("=" * 74)

    for name, kind, desc, make in sources:
        x, y = make()
        rows = [polynomial_codelength(x, y, d) for d in range(max_degree + 1)]
        best = min(rows, key=lambda r: r["total"])
        # No literal-encoding baseline exists for continuous data (see the
        # dropped-constant note in polynomial_codelength), so the reference point
        # is the d=0 row: a constant plus noise, i.e. "no structure found".
        baseline = rows[0]["total"]

        print("\n  source: %s  [%s]  -- %s" % (name, kind, desc))
        print("  %7s %12s %12s %12s %12s" % ("degree d", "L(theta)", "L(y|theta)", "total", "resid rms"))
        for r in rows:
            mark = "  <-- MDL" if r["index"] == best["index"] else ""
            print(
                "  %7d %12.1f %12.1f %12.1f %12.4f%s"
                % (r["index"], r["params"], r["data"], r["total"], r["rms"], mark)
            )
        saved = baseline - best["total"]
        print(
            "  => MDL picks d = %d: %.1f bits saved over d=0, residual rms %.4f"
            % (best["index"], saved, best["rms"])
        )
        if name == "newton" and best["index"] != 2:
            print("     (the true model is degree 2; the crude code overshoots to d = %d"
                  % best["index"])
            print("      because coefficients are quantized at 1/sqrt(n) ~ %.3f, coarse enough"
                  % (1 / (n ** 0.5)))
            print("      that a higher degree can buy back the rounding error. This arbitrariness")
            print("      of crude two-part codes is exactly what refined MDL fixes -- Sec. 2.4.)")
        if name == "sine":
            # rms of sin over whole periods is 1/sqrt(2) = 0.707. Landing there
            # means the fit explained none of the signal.
            print("     (the signal has amplitude 1.0 and noise sd 0.05 -- a residual rms")
            print("      near 0.7 means MDL has booked essentially the whole sine as noise)")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("model", nargs="?", default="both", choices=["markov", "polynomial", "both"])
    p.add_argument("--n", type=int, default=None, help="sample size (default 20000 markov / 500 poly)")
    p.add_argument("--max-order", type=int, default=12, help="largest Markov order to consider")
    p.add_argument("--max-degree", type=int, default=20, help="largest polynomial degree to consider")
    p.add_argument("--omega", type=float, default=40.0, help="frequency of the sine source")
    args = p.parse_args()

    # Different defaults per model class: the Markov demo needs a long sequence
    # for the high-order counts to mean anything, the polynomial demo does not.
    if args.model in ("markov", "both"):
        run_markov(args.n or 20000, args.max_order)
    if args.model in ("polynomial", "both"):
        run_polynomial(args.n or 500, args.max_degree, args.omega)


if __name__ == "__main__":
    main()
