<?php

declare(strict_types=1);

/**
 * Parâmetros centralizados da análise (equivalente à aba CONFIG do VBA).
 * Edite este arquivo para ajustar tolerâncias, caminhos de catálogos e overrides
 * sem tocar no código. Caminhos relativos são resolvidos a partir da raiz do app.
 */

return [
    // Tolerância relativa (0.10 = 10%) na comparação material x serviço por família.
    'aderencia_tolerancia' => 0.10,

    // Valor mínimo (em moeda) para uma família entrar na análise de aderência.
    'aderencia_valor_minimo' => 1.0,

    // Caminhos padrão dos catálogos externos (podem ser sobrescritos via CLI).
    'catalogos' => [
        'materiais' => getenv('CAT_MATERIAIS') ?: '',
        'servicos'  => getenv('CAT_SERVICOS') ?: '',
        'classes'   => getenv('CAT_CLASSE') ?: '',
    ],

    // Overrides fixos de CLS2 por código de serviço (mesma regra do VBA:
    // força "COND PROT" para casar serviço de cabo compacto com o material).
    'overrides_cls2_servico' => [
        '5500000582' => 'COND PROT', // AHO204_B_INST RD COMPACT(SPACE CAB)MT-LM
        '5500000575' => 'COND PROT', // AHO202_A_INST COND. 70/120 MM CB/AL-LM
    ],

    // Marcador de classificação pendente.
    'marcador_classificar' => 'CLASSIFICAR',
];
