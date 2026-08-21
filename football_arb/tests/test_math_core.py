"""
Testes unitários do NÚCLEO matemático — e só do núcleo.

Cobrimos apenas o que precisa ser confiável: prob implícita, arb_index,
margem, stakes de payout equalizado, lucro e ROI. Providers, formatação e
CLI NÃO são testados aqui de propósito: se a matemática estiver certa, o
resto é encanamento.
"""

import math

import pytest

from football_arb.math_core import (
    arb_index,
    implied_probability,
    is_arbitrage,
    margin,
    profit_and_roi,
    stakes_for_equal_payout,
)


# ---------------------------------------------------------------- prob implícita
def test_implied_probability_basic():
    assert implied_probability(2.0) == pytest.approx(0.5)
    assert implied_probability(4.0) == pytest.approx(0.25)


def test_implied_probability_rejects_invalid_odds():
    for bad in (1.0, 0.5, 0.0, -3.0):
        with pytest.raises(ValueError):
            implied_probability(bad)


# --------------------------------------------------------------------- arb_index
def test_arb_index_two_way():
    # 1/2.0 + 1/2.0 = 1.0 exatamente (mercado justo, sem margem).
    assert arb_index([2.0, 2.0]) == pytest.approx(1.0)


def test_arb_index_three_way_with_arb():
    idx = arb_index([3.10, 3.90, 3.20])
    assert idx < 1.0
    assert idx == pytest.approx(1 / 3.10 + 1 / 3.90 + 1 / 3.20)


def test_arb_index_normal_market_above_one():
    # Mercado típico embute margem da casa -> soma > 1.
    assert arb_index([2.10, 3.30, 3.50]) > 1.0


def test_arb_index_requires_two_outcomes():
    with pytest.raises(ValueError):
        arb_index([2.0])


# ------------------------------------------------------------------------ margem
def test_margin_is_one_minus_index():
    odds = [3.10, 3.90, 3.20]
    assert margin(odds) == pytest.approx(1.0 - arb_index(odds))


def test_margin_negative_for_normal_market():
    assert margin([2.10, 3.30, 3.50]) < 0.0


# ------------------------------------------------------- stakes / payout igual
def test_stakes_sum_to_bankroll():
    odds = [3.10, 3.90, 3.20]
    stakes = stakes_for_equal_payout(odds, 1000.0)
    assert sum(stakes) == pytest.approx(1000.0)


def test_stakes_produce_equal_payout():
    odds = [3.10, 3.90, 3.20]
    bankroll = 1000.0
    stakes = stakes_for_equal_payout(odds, bankroll)
    payouts = [s * o for s, o in zip(stakes, odds)]
    # Todos os payouts iguais entre si.
    for p in payouts:
        assert p == pytest.approx(payouts[0])
    # E iguais a bankroll / arb_index.
    assert payouts[0] == pytest.approx(bankroll / arb_index(odds))


def test_stakes_two_way():
    odds = [2.05, 2.10]
    stakes = stakes_for_equal_payout(odds, 500.0)
    assert sum(stakes) == pytest.approx(500.0)
    p0, p1 = (s * o for s, o in zip(stakes, odds))
    assert p0 == pytest.approx(p1)


def test_stakes_reject_bad_bankroll():
    with pytest.raises(ValueError):
        stakes_for_equal_payout([2.0, 2.0], 0.0)
    with pytest.raises(ValueError):
        stakes_for_equal_payout([2.0, 2.0], -100.0)


# ---------------------------------------------------------------- lucro / ROI
def test_profit_positive_when_arb_exists():
    odds = [3.10, 3.90, 3.20]
    bankroll = 1000.0
    profit, roi = profit_and_roi(odds, bankroll)
    assert profit > 0
    # ROI == (1/arb_index) - 1
    assert roi == pytest.approx(1.0 / arb_index(odds) - 1.0)
    assert profit == pytest.approx(bankroll * roi)


def test_profit_negative_for_normal_market():
    profit, roi = profit_and_roi([2.10, 3.30, 3.50], 1000.0)
    assert profit < 0
    assert roi < 0


def test_roi_matches_manual_formula():
    odds = [2.05, 2.10]
    bankroll = 500.0
    idx = arb_index(odds)
    expected_profit = bankroll / idx - bankroll
    profit, roi = profit_and_roi(odds, bankroll)
    assert profit == pytest.approx(expected_profit)
    assert roi == pytest.approx(expected_profit / bankroll)


# --------------------------------------------------------- is_arbitrage / margem
def test_is_arbitrage_respects_min_margin():
    odds = [2.05, 2.10]  # margem ~3.6%
    assert is_arbitrage(odds, min_margin=0.01) is True
    assert is_arbitrage(odds, min_margin=0.05) is False


def test_fair_market_is_not_arbitrage():
    # Exatamente 1.0 de índice -> margem 0 -> não passa em nenhum min>0.
    assert is_arbitrage([2.0, 2.0], min_margin=0.01) is False


def test_full_math_consistency_roundtrip():
    # Invariante central: profit == bankroll * margin / arb_index e
    # payout equalizado == bankroll + profit.
    odds = [3.10, 3.90, 3.20]
    bankroll = 1234.56
    idx = arb_index(odds)
    profit, _ = profit_and_roi(odds, bankroll)
    assert profit == pytest.approx(bankroll * margin(odds) / idx)
    stakes = stakes_for_equal_payout(odds, bankroll)
    payout = stakes[0] * odds[0]
    assert payout == pytest.approx(bankroll + profit)
