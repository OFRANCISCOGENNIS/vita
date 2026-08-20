# Testes estáticos dos módulos VBA

Como os módulos `.bas` só executam dentro do Excel (Windows + VBA), este
diretório traz uma **bateria de testes estáticos** que valida a integridade
estrutural do código — onde ficam os erros de compilação do VBA — sem precisar
abrir o Excel.

## Uso

```bash
python3 vba/tests/vba_lint.py vba/inventario.bas
```

## O que é verificado

| Teste | Descrição |
|-------|-----------|
| Balanceamento de blocos | `Sub`/`Function`/`If`/`For`/`With`/`Do`/`Select`/`Type` abertos e fechados |
| Aspas balanceadas | strings pareadas em cada linha lógica |
| Continuações de linha | ` _` sempre com linha seguinte válida |
| Procedimentos duplicados | nomes repetidos (erro de compilação no VBA) |
| Chamadas `Call X` | apontam para `Sub` definido no módulo |
| `Option Explicit` | presente |

O analisador trata `For ... : ... : Next` de linha única (statements separados
por `:`) como código válido.

## Limitações

Não cobre erros de runtime dependentes de dados (divisão por zero, `Subscript
out of range`, índice de array) — isso exige executar o módulo sobre uma
planilha real no Excel.

## Testes de lógica de negócio (dentro do Excel)

A correção das regras de negócio é validada por um harness que roda **dentro do
Excel**, sobre as funções puras do módulo (aderência, COM crítico, cabo isento,
unidade contável, razões NT.006):

1. `Alt+F8` → `TestarLogicaInventario` → Executar.
2. O resultado aparece num `MsgBox` (`X de Y testes passaram`) e na aba
   `TESTES`, com cada asserção pintada de verde (passou) ou vermelho (falhou).

Assim regressões na lógica ficam detectáveis sem depender de inspeção manual.
