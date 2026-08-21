"""
math_core — O núcleo matemático da detecção de arbitragem.

Esta é a ÚNICA parte do projeto que precisa ser 100% correta e é a
única coberta por testes unitários. Todas as funções aqui são puras
(sem I/O, sem estado global) para serem trivialmente testáveis.

Definições (odds decimais):
    - odd decimal `o`  → payout total (stake + lucro) por unidade apostada
    - implied prob     → 1 / o  (probabilidade que a casa "precifica")
    - arb_index        → soma das implied probs de TODOS os resultados
                          mutuamente exclusivos e exaustivos
    - margem           → 1 - arb_index

Se arb_index < 1.0, existe (em teoria) uma combinação de apostas que
garante lucro independentemente do resultado. Ver comentários abaixo
sobre por que "em teoria" faz muito trabalho pesado nessa frase.
"""

from __future__ import annotations

from typing import Sequence, Tuple

# Premissa frágil #1 (arredondamento / erro numérico):
# Trabalhamos em float. Diferenças na 10ª casa decimal não importam
# para dinheiro, mas comparações de igualdade contra 1.0 devem usar
# esta tolerância em vez de `==`.
_EPS = 1e-12


def implied_probability(odd: float) -> float:
    """Probabilidade implícita de uma odd decimal: 1 / odd.

    Premissa frágil #2: odd decimal > 1.0 sempre. Uma odd <= 1.0 não
    tem sentido em mercado real (payout menor que o stake). Rejeitamos
    para não mascarar dados sujos de um provider como "oportunidade".
    """
    if odd <= 1.0:
        raise ValueError(f"Odd decimal deve ser > 1.0, recebido: {odd!r}")
    return 1.0 / odd


def arb_index(odds: Sequence[float]) -> float:
    """Soma das probabilidades implícitas de todos os resultados.

    Premissa frágil #3 (exaustividade): assumimos que `odds` cobre
    resultados MUTUAMENTE EXCLUSIVOS e EXAUSTIVOS (ex.: 1/X/2 no futebol,
    ou 2-way sem empate). Se faltar um resultado, o arb_index vem baixo
    artificialmente e um falso positivo aparece. O detector valida a
    contagem de resultados por tipo de mercado; aqui só somamos.
    """
    if len(odds) < 2:
        raise ValueError("Arbitragem exige ao menos 2 resultados.")
    return sum(implied_probability(o) for o in odds)


def margin(odds: Sequence[float]) -> float:
    """Margem de arbitragem = 1 - arb_index.

    Positiva → oportunidade teórica. É a fatia do bankroll que retorna
    como lucro garantido (antes de custos/risco). Também chamada de
    "edge". NÃO confundir com ROI (ver profit_and_roi)."""
    return 1.0 - arb_index(odds)


def stakes_for_equal_payout(
    odds: Sequence[float], bankroll: float
) -> list[float]:
    """Distribui o bankroll para que o PAYOUT seja igual em qualquer
    resultado (a definição clássica de arbitragem de payout equalizado).

    stake_i = bankroll * (1/odd_i) / arb_index

    Com isso:
        payout_i = stake_i * odd_i = bankroll / arb_index   (igual p/ todo i)
        sum(stake_i) = bankroll                              (usa tudo)

    Premissa frágil #4 (stake fracionado): devolvemos stakes em float,
    possivelmente com centavos fracionários. Casas reais aceitam apenas
    incrementos (ex.: R$0,01 ou R$1,00). Arredondar QUEBRA a igualdade de
    payout e reduz o lucro — por isso NÃO arredondamos aqui; quem for
    "executar" (ninguém deveria) precisa lidar com isso e reavaliar.

    Premissa frágil #5 (bankroll fixo por evento): assumimos que todo o
    bankroll vai para ESTE evento. Alocar entre eventos concorrentes é
    problema de gestão de banca fora do escopo do núcleo.
    """
    if bankroll <= 0:
        raise ValueError("Bankroll deve ser > 0.")
    idx = arb_index(odds)
    return [bankroll * implied_probability(o) / idx for o in odds]


def profit_and_roi(
    odds: Sequence[float], bankroll: float
) -> Tuple[float, float]:
    """Retorna (lucro_absoluto, roi_fracionario) para stakes equalizados.

    lucro  = bankroll / arb_index - bankroll
    roi    = lucro / bankroll = (1 / arb_index) - 1

    ROI aqui é sobre o BANKROLL TOTAL apostado no evento (todas as pernas),
    não sobre uma perna. Como todo o bankroll é usado, ROI == margem /
    arb_index. É negativo quando arb_index > 1 (mercado normal, sem arb).
    """
    if bankroll <= 0:
        raise ValueError("Bankroll deve ser > 0.")
    idx = arb_index(odds)
    guaranteed_payout = bankroll / idx
    profit = guaranteed_payout - bankroll
    roi = profit / bankroll
    return profit, roi


def is_arbitrage(odds: Sequence[float], min_margin: float = 0.01) -> bool:
    """True se a margem excede `min_margin`.

    Premissa frágil #6 (margem mínima): o default de 1% NÃO é lucro
    "de graça" — é um colchão para absorver movimento de odd entre a
    leitura e a hipotética execução, erro de arredondamento e spread.
    Uma margem de 0.2% é ruído; tratá-la como oportunidade é enganar a
    si mesmo. Ajuste conforme sua tolerância, mas nunca use 0.
    """
    return margin(odds) >= min_margin
