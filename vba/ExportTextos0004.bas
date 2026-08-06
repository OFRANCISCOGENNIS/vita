' =============================================================================
'  ExportTextos.bas  -  VBA para ZWCAD 2024+  -  v3.2
'  -----------------------------------------------------------------
'  NOVIDADE v3.2: LEITURA DE BLOCOS DE CABO + REORDENACAO DE ABAS
'  -----------------------------------------------------------------
'  - Le blocos de CABO (RDARA1110) com atributos:
'      TCABO (tipo/spec), DISTANCIA, =DISTANC (calculada), AM_AI_FA,
'      AM_AI_NE, DIST_OB. Classifica em COND MT / COND BT.
'      Gera aba "Cabos (Blocos)" com resumo por familia + status.
'  - As abas de blocos (Postes e Cabos) agora aparecem como as
'      PRIMEIRAS da planilha.
'
'  v3.1: LEITURA DE BLOCOS DE POSTE (RDARA1100) com atributos
'        NUMERO, EXISTENTE, PROJETADO, ESTAI, OCUPANTES, COORD Z.
'        Aba "Postes (Blocos)".
'
'  v3.0: Classificacao com confianca, Alertas, Vinculos, Quantitativo (BOM).
' =============================================================================

Option Explicit

' Constante de diagnostico: True mostra MsgBox com os primeiros 15 layers lidos.
Private Const DIAGNOSTICO_LAYERS As Boolean = False

' =============================================================================
'  LEITURA SEGURA DE COR
'  ZWCAD pode ter layers com TrueColor (RGB) que nao expoem .Color direto.
'  Estes helpers tentam varias propriedades e fazem fallback para 7 (preto/branco).
' =============================================================================
Private Function CorLayerSegura(ByVal layObj As Object) As Integer
    On Error GoTo Fallback
    Dim c As Long
    c = layObj.Color
    If c >= 1 And c <= 255 Then
        CorLayerSegura = CInt(c)
        Exit Function
    End If
Fallback:
    On Error Resume Next
    ' Tenta TrueColor.ColorIndex (algumas versoes)
    Dim ci As Integer
    ci = layObj.TrueColor.ColorIndex
    If Err.Number = 0 And ci >= 1 And ci <= 255 Then
        CorLayerSegura = ci
        Exit Function
    End If
    Err.Clear
    ' Ultima alternativa: EntityColor
    Dim ec As Long
    ec = layObj.EntityColor
    If Err.Number = 0 And ec >= 1 And ec <= 255 Then
        CorLayerSegura = CInt(ec)
        Exit Function
    End If
    CorLayerSegura = 7  ' fallback final
End Function

Private Function CorEntidadeSegura(ByVal entObj As Object) As Integer
    On Error GoTo Fallback
    Dim c As Long
    c = entObj.Color
    ' Valido: 0=ByBlock, 1..255=ACI, 256=ByLayer
    If c >= 0 And c <= 256 Then
        CorEntidadeSegura = CInt(c)
        Exit Function
    End If
Fallback:
    On Error Resume Next
    Dim ci As Integer
    ci = entObj.TrueColor.ColorIndex
    If Err.Number = 0 And ci >= 1 And ci <= 255 Then
        CorEntidadeSegura = ci
        Exit Function
    End If
    Err.Clear
    CorEntidadeSegura = 256  ' fallback: ByLayer
End Function

' =============================================================================
'  ESPACO A LER: ModelSpace / Paper Space (IsLayout) OU XREF carregado.
'  Permite que a leitura alcance tambem o conteudo de referencias externas
'  (comum em as-builts exportados do SAP, onde a base vem como XREF).
' =============================================================================
Private Function EhEspacoParaLer(ByVal blk As Object) As Boolean
    Dim r As Boolean
    r = False
    On Error Resume Next
    If blk.IsLayout Then r = True
    If Not r Then
        If blk.IsXRef Then r = True
    End If
    On Error GoTo 0
    EhEspacoParaLer = r
End Function

' =============================================================================
'  COR ACI
' =============================================================================
Private Function NomeCorACI(ByVal aci As Integer) As String
    Select Case aci
        Case 1:   NomeCorACI = "Vermelho"
        Case 2:   NomeCorACI = "Amarelo"
        Case 3:   NomeCorACI = "Verde"
        Case 4:   NomeCorACI = "Ciano"
        Case 5:   NomeCorACI = "Azul"
        Case 6:   NomeCorACI = "Magenta"
        Case 7:   NomeCorACI = "Branco/Preto"
        Case 8:   NomeCorACI = "Cinza escuro"
        Case 9:   NomeCorACI = "Cinza claro"
        Case 256: NomeCorACI = "ByLayer"
        Case 0:   NomeCorACI = "ByBlock"
        Case Else: NomeCorACI = "ACI " & aci
    End Select
End Function

' =============================================================================
'  STATUS POR LAYER
'  Traduz o nome do layer para a categoria de status do material.
' =============================================================================
Private Function StatusPorLayer(ByVal layerName As String) As String
    Dim s As String
    s = UCase$(Trim$(layerName))
    ' Regra explicita: RAMAIS_NO_MODEL sempre conta como Instalado
    If InStr(s, "RAMAIS_NO_MODEL") > 0 Or InStr(s, "RAMAIS NO MODEL") > 0 Then
        StatusPorLayer = "MATERIAIS INSTALADOS"
    ' Layer "#INSTALADO" -> MATERIAIS INSTALADOS
    ElseIf InStr(s, "#INSTALADO") > 0 Then
        StatusPorLayer = "MATERIAIS INSTALADOS"
    ElseIf InStr(s, "TEXTOS A IMPLANTAR") > 0 Or InStr(s, "A IMPLANTAR") > 0 Then
        StatusPorLayer = "MATERIAIS INSTALADOS"
    ElseIf InStr(s, "TEXTOS A REMOVER") > 0 Or InStr(s, "A REMOVER") > 0 Then
        StatusPorLayer = "MATERIAIS DESINSTALADOS"
    ElseIf InStr(s, "TEXTOS EXISTENTES") > 0 Or InStr(s, "EXISTENTES") > 0 Then
        StatusPorLayer = "MATERIAIS EXISTENTES"
    Else
        StatusPorLayer = "NAO CLASSIFICADO"
    End If
End Function

' =============================================================================
'  STATUS POR NOME DO BLOCO  (tem PRIORIDADE sobre o layer)
'  -----------------------------------------------------------------------------
'  Regras do projeto (v3.4):
'    RDARA034  -> DUPLO (existente=desinstalado / projetado=instalado)
'    RDARA1100 -> DUPLO (existente=desinstalado / projetado=instalado)
'    RDARA1110 -> MATERIAIS INSTALADOS
'    RDARA1111 -> MATERIAIS DESINSTALADOS
'    RDARA1011 -> MATERIAIS INSTALADOS
'    RDARA120  -> MATERIAIS DESINSTALADOS
'    RDARA121  -> MATERIAIS INSTALADOS
'    RDARA164  -> MATERIAIS EXISTENTES
'  Retorna "" quando o bloco nao tem regra (usa o layer normalmente).
'
'  IMPORTANTE: a regra do "#" (texto comecando com #) sobrescreve TUDO e
'  marca como DESINSTALADO. Isso e tratado em StatusComHashtag.
'
'  Matching seguro: casa o nome exato OU com sufixo de versao (ex: RDARA120V3),
'  mas NUNCA com outro digito (RDARA120 != RDARA1200).
' =============================================================================
Private Function StatusPorBloco(ByVal nomeBloco As String) As String
    Dim s As String
    s = UCase$(Trim$(nomeBloco))

    If BlocoCasa(s, "RDARA034") Then
        StatusPorBloco = "DUPLO"
    ElseIf BlocoCasa(s, "RDARA1100") Then
        StatusPorBloco = "DUPLO"
    ElseIf BlocoCasa(s, "RDARA1110") Then
        StatusPorBloco = "MATERIAIS INSTALADOS"
    ElseIf BlocoCasa(s, "RDARA1111") Then
        StatusPorBloco = "MATERIAIS DESINSTALADOS"
    ElseIf BlocoCasa(s, "RDARA1011") Then
        StatusPorBloco = "MATERIAIS INSTALADOS"
    ElseIf BlocoCasa(s, "RDARA120") Then
        StatusPorBloco = "MATERIAIS DESINSTALADOS"
    ElseIf BlocoCasa(s, "RDARA121") Then
        StatusPorBloco = "MATERIAIS INSTALADOS"
    ElseIf BlocoCasa(s, "RDARA164") Then
        StatusPorBloco = "MATERIAIS EXISTENTES"
    ' --- Reclassificacao por planilha RECLASSIFICAR MATERIAL ---
    ElseIf BlocoCasa(s, "RDARA1002") Then
        StatusPorBloco = "MATERIAIS INSTALADOS"   ' ATERRAMENTO
    ElseIf BlocoCasa(s, "RDARA1018") Then
        StatusPorBloco = "MATERIAIS INSTALADOS"   ' CH FUSIVEL
    ElseIf BlocoCasa(s, "RDARA1023") Then
        StatusPorBloco = "MATERIAIS INSTALADOS"   ' CH FACA
    ElseIf BlocoCasa(s, "RDARA1125") Then
        StatusPorBloco = "MATERIAIS INSTALADOS"   ' CORDOALHA
    ElseIf BlocoCasa(s, "RDARA175") Then
        StatusPorBloco = "MATERIAIS INSTALADOS"   ' ATERRAMENTO DE CERCA
    ElseIf BlocoCasa(s, "RDARA511") Then
        StatusPorBloco = "MATERIAIS EXISTENTES"   ' TRAFO
    ElseIf BlocoCasa(s, "RDARA512") Then
        StatusPorBloco = "MATERIAIS INSTALADOS"   ' CH FUSIVEL
    ElseIf BlocoCasa(s, "RDARA513") Then
        StatusPorBloco = "MATERIAIS EXISTENTES"   ' PARA RAIO
    ElseIf BlocoCasa(s, "RDARA514") Then
        StatusPorBloco = "MATERIAIS EXISTENTES"   ' ATERRAMENTO
    ElseIf BlocoCasa(s, "RDARA532") Then
        StatusPorBloco = "MATERIAIS EXISTENTES"   ' CH FUSIVEL
    ElseIf BlocoCasa(s, "RDARA537") Then
        StatusPorBloco = "MATERIAIS EXISTENTES"   ' CH FACA
    ElseIf BlocoCasa(s, "RDARA547") Then
        StatusPorBloco = "MATERIAIS EXISTENTES"   ' RELIGADOR
    Else
        StatusPorBloco = ""
    End If
End Function

' Familia forcada por NOME do bloco (planilha RECLASSIFICAR MATERIAL).
' Retorna "" quando nao ha regra especifica e deixa a deteccao por palavra-chave.
Private Function FamiliaForcadaBloco(ByVal nomeBloco As String) As String
    Dim s As String
    s = UCase$(Trim$(nomeBloco))
    If BlocoCasa(s, "RDARA1002") Then
        FamiliaForcadaBloco = "ATERRAMENTO"
    ElseIf BlocoCasa(s, "RDARA1018") Then
        FamiliaForcadaBloco = "CH FUSIVEL"
    ElseIf BlocoCasa(s, "RDARA1023") Then
        FamiliaForcadaBloco = "CH FACA"
    ElseIf BlocoCasa(s, "RDARA1125") Then
        FamiliaForcadaBloco = "CORDOALHA"
    ElseIf BlocoCasa(s, "RDARA175") Then
        FamiliaForcadaBloco = "ATERRAMENTO DE CERCA"
    ElseIf BlocoCasa(s, "RDARA511") Then
        FamiliaForcadaBloco = "TRAFO"
    ElseIf BlocoCasa(s, "RDARA512") Then
        FamiliaForcadaBloco = "CH FUSIVEL"
    ElseIf BlocoCasa(s, "RDARA513") Then
        FamiliaForcadaBloco = "PARA RAIO"
    ElseIf BlocoCasa(s, "RDARA514") Then
        FamiliaForcadaBloco = "ATERRAMENTO"
    ElseIf BlocoCasa(s, "RDARA532") Then
        FamiliaForcadaBloco = "CH FUSIVEL"
    ElseIf BlocoCasa(s, "RDARA537") Then
        FamiliaForcadaBloco = "CH FACA"
    ElseIf BlocoCasa(s, "RDARA547") Then
        FamiliaForcadaBloco = "RELIGADOR"
    Else
        FamiliaForcadaBloco = ""
    End If
End Function

' Verifica se um texto comeca com "#" (apos remover espacos e codigos MText).
' Tais textos representam material DESINSTALADO.
Private Function ComecaComHashtag(ByVal txt As String) As Boolean
    Dim s As String
    s = LTrim$(RemoverCodigosMText(txt))
    If Len(s) > 0 Then
        ComecaComHashtag = (Left$(s, 1) = "#")
    Else
        ComecaComHashtag = False
    End If
End Function

' Retorna True se 'nomeUpper' for igual a 'alvo' OU comecar com 'alvo' seguido
' de um caractere NAO-numerico (sufixo de versao). Evita que RDARA120 case
' com RDARA1200.
Private Function BlocoCasa(ByVal nomeUpper As String, ByVal alvo As String) As Boolean
    Dim p As Long
    p = InStr(nomeUpper, alvo)
    If p = 0 Then
        BlocoCasa = False
        Exit Function
    End If
    Dim posFim As Long
    posFim = p + Len(alvo)   ' posicao do caractere logo apos o alvo
    If posFim > Len(nomeUpper) Then
        ' alvo termina exatamente no fim da string
        BlocoCasa = True
        Exit Function
    End If
    Dim chFim As String
    chFim = Mid$(nomeUpper, posFim, 1)
    ' Se o proximo caractere for digito, NAO casa (ex: RDARA1200)
    If chFim >= "0" And chFim <= "9" Then
        BlocoCasa = False
    Else
        BlocoCasa = True
    End If
End Function

' Identifica se um bloco e do tipo CABO pelas regras de nome.
'   RDARA1110 e RDARA1111 sao cabos.
Private Function EhBlocoCabo(ByVal nomeBloco As String) As Boolean
    Dim s As String
    s = UCase$(Trim$(nomeBloco))
    If BlocoCasa(s, "RDARA1110") Then EhBlocoCabo = True: Exit Function
    If BlocoCasa(s, "RDARA1111") Then EhBlocoCabo = True: Exit Function
    If InStr(s, "CABO") > 0 Then EhBlocoCabo = True: Exit Function
    EhBlocoCabo = False
End Function

' Identifica se um bloco e do tipo POSTE/ESTRUTURA pelas regras de nome.
Private Function EhBlocoPoste(ByVal nomeBloco As String) As Boolean
    Dim s As String
    s = UCase$(Trim$(nomeBloco))
    ' Cabos nao sao postes
    If EhBlocoCabo(nomeBloco) Then EhBlocoPoste = False: Exit Function
    If BlocoCasa(s, "RDARA034") Then EhBlocoPoste = True: Exit Function
    If BlocoCasa(s, "RDARA1100") Then EhBlocoPoste = True: Exit Function
    If BlocoCasa(s, "RDARA120") Then EhBlocoPoste = True: Exit Function
    If BlocoCasa(s, "RDARA121") Then EhBlocoPoste = True: Exit Function
    If BlocoCasa(s, "RDARA164") Then EhBlocoPoste = True: Exit Function
    If Left$(s, 5) = "RDPRD" Then EhBlocoPoste = True: Exit Function
    If InStr(s, "POSTE") > 0 Then EhBlocoPoste = True: Exit Function
    EhBlocoPoste = False
End Function

' Resolve o status final priorizando o NOME DO BLOCO sobre o layer.
' Para "DUPLO", devolve "INSTALADO/DESINSTALADO" (o desdobramento em 2 linhas
' eh feito na escrita).
Private Function StatusFinalBloco(ByVal nomeBloco As String, _
                                   ByVal layerName As String) As String
    Dim sb As String
    sb = StatusPorBloco(nomeBloco)
    If sb = "DUPLO" Then
        StatusFinalBloco = "INSTALADO/DESINSTALADO"
    ElseIf Len(sb) > 0 Then
        StatusFinalBloco = sb
    Else
        StatusFinalBloco = StatusPorLayer(layerName)
    End If
End Function

' Classifica a FAMILIA de material de um bloco, usando o nome do bloco e/ou
' os textos dos atributos. Retorna uma das familias conhecidas.
Private Function FamiliaDeBloco(ByVal nomeBloco As String, _
                                 ByVal textoAtributos As String) As String
    Dim nb As String, tx As String, s As String
    nb = UCase$(Trim$(nomeBloco))
    tx = UCase$(Trim$(textoAtributos))
    s = nb & " " & tx   ' procura pistas em ambos

    ' Regra explicita por nome de bloco (planilha RECLASSIFICAR MATERIAL)
    Dim ff As String
    ff = FamiliaForcadaBloco(nomeBloco)
    If Len(ff) > 0 Then FamiliaDeBloco = ff: Exit Function

    ' Poste e cabo tem deteccao propria (mantida)
    If EhBlocoCabo(nomeBloco) Then FamiliaDeBloco = "CABO": Exit Function
    If EhBlocoPoste(nomeBloco) Then FamiliaDeBloco = "POSTE": Exit Function

    ' Demais materiais por palavra-chave
    If InStr(s, "RELIGADOR") > 0 Or InStr(s, "RELIG") > 0 Then
        FamiliaDeBloco = "RELIGADOR": Exit Function
    End If
    If InStr(s, "REGULADOR") > 0 Or InStr(s, "REGUL") > 0 Then
        FamiliaDeBloco = "REGULADOR": Exit Function
    End If
    If InStr(s, "PARA-RAIO") > 0 Or InStr(s, "PARA RAIO") > 0 Or _
       InStr(s, "PARARAIO") > 0 Or InStr(s, "PR ") > 0 Or _
       InStr(s, "PR-") > 0 Then
        FamiliaDeBloco = "PARA RAIO": Exit Function
    End If
    If InStr(s, "FUSIVEL") > 0 Or InStr(s, "CH.FUS") > 0 Or _
       InStr(s, "CH FUS") > 0 Or InStr(s, "CHFUS") > 0 Then
        FamiliaDeBloco = "CH FUSIVEL": Exit Function
    End If
    If InStr(s, "CH.FACA") > 0 Or InStr(s, "CH FACA") > 0 Or _
       InStr(s, "CHFACA") > 0 Or InStr(s, "SECCION") > 0 Then
        FamiliaDeBloco = "CH FACA": Exit Function
    End If
    If InStr(s, "CHAVE") > 0 Then
        FamiliaDeBloco = "CHAVE": Exit Function
    End If
    If InStr(s, "TRAFO") > 0 Or InStr(s, "TRANSFORM") > 0 Or _
       InStr(s, "KVA") > 0 Then
        FamiliaDeBloco = "TRAFO": Exit Function
    End If
    If InStr(s, "MUFLA") > 0 Then
        FamiliaDeBloco = "MUFLA": Exit Function
    End If
    If InStr(s, "ATERR") > 0 Then
        FamiliaDeBloco = "ATERRAMENTO": Exit Function
    End If
    If InStr(s, "MEDIDOR") > 0 Or InStr(s, "MEDIC") > 0 Then
        FamiliaDeBloco = "MEDICAO": Exit Function
    End If
    If InStr(s, "CAPACITOR") > 0 Then
        FamiliaDeBloco = "CAPACITOR": Exit Function
    End If
    If InStr(s, "RAMAL") > 0 Then
        FamiliaDeBloco = "RAMAL": Exit Function
    End If

    FamiliaDeBloco = "OUTRO"
End Function

' =============================================================================
'  REMOVE CODIGOS DE FORMATACAO DO MTEXT
' =============================================================================
Private Function RemoverCodigosMText(ByVal s As String) As String
    Dim r As String, i As Long, ch As String, nxt As String, j As Long
    r = s
    r = Replace(r, "\P", " ")
    r = Replace(r, "\p", " ")
    Dim outStr As String
    outStr = ""
    i = 1
    Do While i <= Len(r)
        ch = Mid$(r, i, 1)
        If ch = "\" And i < Len(r) Then
            nxt = Mid$(r, i + 1, 1)
            If InStr("fFhHcCqQwWlLoOkKpPaAtT", nxt) > 0 Then
                j = InStr(i + 1, r, ";")
                If j > 0 Then
                    i = j + 1
                Else
                    i = i + 2
                End If
            Else
                outStr = outStr & ch
                i = i + 1
            End If
        ElseIf ch = "{" Or ch = "}" Then
            i = i + 1
        Else
            outStr = outStr & ch
            i = i + 1
        End If
    Loop
    RemoverCodigosMText = outStr
End Function

' =============================================================================
'  EXTRAI NOME BASE DO POSTE/ESTRUTURA
'  Remove complementos apos o identificador principal.
'  Ex: "C12/600 N3-N3D S021" -> "C12/600"
'      "M11 N1 S024 EA1"     -> "M11"
'      "DT11/300 N1 S034"    -> "DT11/300"
' =============================================================================
Private Function ExtrairNomeBasePoste(ByVal txt As String) As String
    Dim s As String, i As Long, ch As String
    Dim prefix As String, digits1 As String, digits2 As String
    s = UCase$(Trim$(RemoverCodigosMText(txt)))
    ' Extrai letras do prefixo (C, DT, M, V, etc.) - max 3
    prefix = ""
    i = 1
    Do While i <= Len(s) And Len(prefix) < 3
        ch = Mid$(s, i, 1)
        If ch >= "A" And ch <= "Z" Then
            prefix = prefix & ch
            i = i + 1
        Else
            Exit Do
        End If
    Loop
    If Len(prefix) = 0 Then
        ExtrairNomeBasePoste = ""
        Exit Function
    End If
    ' Pula UM espaco entre prefixo e numeros (ex: "C 11/400")
    If i <= Len(s) Then
        If Mid$(s, i, 1) = " " Then i = i + 1
    End If
    ' Extrai primeiro bloco de digitos
    digits1 = ""
    Do While i <= Len(s)
        ch = Mid$(s, i, 1)
        If ch >= "0" And ch <= "9" Then
            digits1 = digits1 & ch
            i = i + 1
        Else
            Exit Do
        End If
    Loop
    If Len(digits1) = 0 Then
        ExtrairNomeBasePoste = ""
        Exit Function
    End If
    ' Verifica barra (ex: C12/600, DT11/300)
    If i <= Len(s) Then
        If Mid$(s, i, 1) = "/" Then
            i = i + 1
            digits2 = ""
            Do While i <= Len(s)
                ch = Mid$(s, i, 1)
                If ch >= "0" And ch <= "9" Then
                    digits2 = digits2 & ch
                    i = i + 1
                Else
                    Exit Do
                End If
            Loop
            If Len(digits2) > 0 Then
                ExtrairNomeBasePoste = prefix & digits1 & "/" & digits2
                Exit Function
            End If
        End If
    End If
    ExtrairNomeBasePoste = prefix & digits1
End Function

' Conta quantos digitos tem o PRIMEIRO bloco numerico de um codigo.
' Ex.: "CE1"->1, "N3"->1, "CUF3"->1, "M11"->2, "D11600"->5, "C12/600"->2.
' Usado para separar ESTRUTURA (1 digito) de POSTE (>=2 digitos).
Private Function ContaDigitosBase(ByVal base As String) As Long
    Dim i As Long, ch As String, started As Boolean, cnt As Long
    base = UCase$(Trim$(base))
    started = False
    cnt = 0
    For i = 1 To Len(base)
        ch = Mid$(base, i, 1)
        If ch >= "0" And ch <= "9" Then
            cnt = cnt + 1
            started = True
        ElseIf started Then
            Exit For   ' terminou o primeiro bloco de digitos
        End If
    Next i
    ContaDigitosBase = cnt
End Function

' =============================================================================
'  CLASSIFICACAO POR FAMILIA
' =============================================================================
Private Function ClassificarFamilia(ByVal txt As String) As String
    Dim s As String
    s = UCase$(Trim$(RemoverCodigosMText(txt)))
    If Len(s) = 0 Then
        ClassificarFamilia = "-"
        Exit Function
    End If
    If InStr(s, "ATERR") > 0 Then
        ClassificarFamilia = "ATERRAMENTO"
        Exit Function
    End If
    If InStr(s, "MUFLA") > 0 Then
        ClassificarFamilia = "MUFLA"
        Exit Function
    End If
    If InStr(s, "PR -") > 0 Or InStr(s, "PR-") > 0 Or _
       InStr(s, "PARA RAIO") > 0 Or InStr(s, "PARA-RAIO") > 0 Then
        If InStr(s, "BT") > 0 Then
            ClassificarFamilia = "PARA RAIO BT"
        Else
            ClassificarFamilia = "PARA RAIO MT"
        End If
        Exit Function
    End If
    If InStr(s, "ELO") > 0 Then
        ClassificarFamilia = "ELO"
        Exit Function
    End If
    If InStr(s, "CH.FUS") > 0 Or InStr(s, "CH FUS") > 0 Then
        ClassificarFamilia = "CH FUS"
        Exit Function
    End If
    If InStr(s, "CH.FACA") > 0 Or InStr(s, "CH FACA") > 0 Or _
       (InStr(s, "630A") > 0 And InStr(s, "27KV") > 0) Then
        ClassificarFamilia = "CH FACA"
        Exit Function
    End If
    If InStr(s, "TR 01") > 0 Or InStr(s, "KVA") > 0 Or _
       (InStr(s, "V-") > 0 And InStr(s, "KV") > 0) Then
        ClassificarFamilia = "TRAFO"
        Exit Function
    End If
    If (InStr(s, "MM²") > 0 Or InStr(s, "MM2") > 0) Or _
       (InStr(s, "Ø") > 0 And InStr(s, "MM") > 0) Then
        ClassificarFamilia = "RAMAL"
        Exit Function
    End If
    If InStr(s, "#CAA") > 0 Or InStr(s, "# CAA") > 0 Or _
       (InStr(s, "M MT ") > 0 And InStr(s, "KV") > 0) Or _
       (InStr(s, " MT ") > 0 And InStr(s, "KV") > 0 And InStr(s, "#") > 0) Then
        ClassificarFamilia = "COND NU"
        Exit Function
    End If
    If Left$(s, 2) = "DT" And InStr(s, "/") > 0 Then
        ClassificarFamilia = "POSTE DT"
        Exit Function
    End If
    If Left$(s, 2) = "FV" And InStr(s, "/") > 0 Then
        ClassificarFamilia = "POSTE CIRCULAR FIBRA"
        Exit Function
    End If
    If Left$(s, 2) = "GV" And InStr(s, "/") > 0 Then
        ClassificarFamilia = "POSTE METALICO"
        Exit Function
    End If
    If (Left$(s, 1) = "C" And InStr(s, "/") > 0) Or _
       (Left$(s, 1) = "M" And (InStr(s, " ") > 0 Or InStr(s, "-") > 0) And _
        (IsNumeric(Mid$(s, 2, 1)) Or IsNumeric(Mid$(s, 2, 2)))) Then
        ClassificarFamilia = "POSTE CIRCULAR"
        Exit Function
    End If
    If RegExEstruturaMT(s) Then
        ClassificarFamilia = "ESTRUTURA MT"
        Exit Function
    End If
    ClassificarFamilia = "CLASSIFICAR"
End Function

Private Function RegExEstruturaMT(ByVal s As String) As Boolean
    Dim c1 As String
    s = Trim$(s)
    If Len(s) = 0 Then
        RegExEstruturaMT = False
        Exit Function
    End If
    If InStr(s, "ESTRUTURA MT") > 0 Then
        RegExEstruturaMT = True
        Exit Function
    End If
    c1 = Left$(s, 1)
    If (c1 = "T" Or c1 = "N" Or c1 = "U") And Len(s) >= 2 Then
        If IsNumeric(Mid$(s, 2, 1)) Then
            RegExEstruturaMT = True
            Exit Function
        End If
    End If
    RegExEstruturaMT = False
End Function

' =============================================================================
'  CLASSIFICACAO ESTENDIDA (v3): retorna familia + score de confianca (0..100)
'  -----------------------------------------------------------------------------
'  Combina pistas do CONTEUDO do texto e do NOME DO LAYER.
'  Pontos somam quando padroes coincidem; nivel final:
'    >= 80 -> Alta    50..79 -> Media    < 50 -> Baixa
'  Resultado escrito em ByRef: famOut, scoreOut.
' =============================================================================
Private Sub ClassificarComConfianca(ByVal txt As String, ByVal layerName As String, _
                                     ByRef famOut As String, ByRef scoreOut As Integer)
    Dim s As String, ly As String
    s = UCase$(Trim$(RemoverCodigosMText(txt)))
    ly = UCase$(Trim$(layerName))

    ' --- Familia base (algoritmo legado) ---
    Dim famBase As String
    famBase = ClassificarFamilia(txt)

    ' --- Pontuacao por padroes no CONTEUDO ---
    Dim score As Integer
    score = 0

    ' Sinais fortes (40 pontos cada)
    If InStr(s, "ATERR") > 0 Then score = score + 40
    If InStr(s, "MUFLA") > 0 Then score = score + 40
    If InStr(s, "PARA RAIO") > 0 Or InStr(s, "PARA-RAIO") > 0 Then score = score + 40
    If InStr(s, "CH.FUS") > 0 Or InStr(s, "CH FUS") > 0 Then score = score + 40
    If InStr(s, "CH.FACA") > 0 Or InStr(s, "CH FACA") > 0 Then score = score + 40
    If InStr(s, "KVA") > 0 Then score = score + 40
    If InStr(s, "#CAA") > 0 Or InStr(s, "# CAA") > 0 Then score = score + 40
    If InStr(s, "ELO") > 0 Then score = score + 45

    ' Sinais medios
    If InStr(s, "PR -") > 0 Or InStr(s, "PR-") > 0 Then score = score + 25
    If InStr(s, "MM²") > 0 Or InStr(s, "MM2") > 0 Then score = score + 30
    If InStr(s, "Ø") > 0 Then score = score + 20
    If InStr(s, "KV") > 0 Then score = score + 15
    If InStr(s, "TR 01") > 0 Then score = score + 30
    If InStr(s, "/") > 0 And Len(s) > 2 Then score = score + 10

    ' Sinal forte: comeca com padrao estrutural de poste/estrutura
    ' (C12/400, M11, DT11/300, etc.)
    If ExtrairNomeBasePoste(txt) <> "" Then
        If famBase = "POSTE CIRCULAR" Or famBase = "POSTE DT" Then
            score = score + 45  ' padrao estrutural + familia poste = quase certeza
        Else
            score = score + 20
        End If
    End If

    ' --- Reforco pelo nome do LAYER ---
    Dim layerDicaFam As String
    layerDicaFam = FamiliaPorLayer(ly)
    If Len(layerDicaFam) > 0 Then
        If layerDicaFam = famBase Then
            ' Layer concorda com conteudo -> +30
            score = score + 30
        Else
            ' Layer sugere familia diferente; confia no layer e ajusta
            famBase = layerDicaFam
            score = score + 25
        End If
    End If

    ' --- Caso CLASSIFICAR mas layer da dica ---
    If famBase = "CLASSIFICAR" And Len(layerDicaFam) > 0 Then
        famBase = layerDicaFam
        score = 60  ' confianca media via layer
    End If

    ' --- Caso CLASSIFICAR sem nenhuma pista: score muito baixo ---
    If famBase = "CLASSIFICAR" Then
        score = score \ 3
    End If

    ' --- Texto vazio ---
    If Len(s) = 0 Then
        famBase = "-"
        score = 0
    End If

    ' Clamp 0..100
    If score > 100 Then score = 100
    If score < 0 Then score = 0

    famOut = famBase
    scoreOut = score
End Sub

' Tenta inferir a familia a partir de palavras-chave no NOME DO LAYER.
' Retorna "" se nada for reconhecido.
Private Function FamiliaPorLayer(ByVal layerUpper As String) As String
    Dim s As String
    s = layerUpper
    If InStr(s, "ATERR") > 0 Then FamiliaPorLayer = "ATERRAMENTO": Exit Function
    If InStr(s, "MUFLA") > 0 Then FamiliaPorLayer = "MUFLA": Exit Function
    If InStr(s, "PARARAIO") > 0 Or InStr(s, "PARA-RAIO") > 0 Or _
       InStr(s, "PARA_RAIO") > 0 Or InStr(s, "PR_BT") > 0 Then
        If InStr(s, "BT") > 0 Then
            FamiliaPorLayer = "PARA RAIO BT"
        Else
            FamiliaPorLayer = "PARA RAIO MT"
        End If
        Exit Function
    End If
    If InStr(s, "ELO") > 0 Then FamiliaPorLayer = "ELO": Exit Function
    If InStr(s, "CHFUS") > 0 Or InStr(s, "CH_FUS") > 0 Or _
       InStr(s, "FUSIVEL") > 0 Then FamiliaPorLayer = "CH FUS": Exit Function
    If InStr(s, "CHFACA") > 0 Or InStr(s, "CH_FACA") > 0 Or _
       InStr(s, "SECCIONADORA") > 0 Then FamiliaPorLayer = "CH FACA": Exit Function
    If InStr(s, "TRAFO") > 0 Or InStr(s, "TRANSFORM") > 0 Then _
       FamiliaPorLayer = "TRAFO": Exit Function
    If InStr(s, "RAMAIS_NO_MODEL") > 0 Or InStr(s, "RAMAIS NO MODEL") > 0 Or _
       InStr(s, "RAMAL") > 0 Then FamiliaPorLayer = "RAMAL": Exit Function
    If InStr(s, "COND_ISOL") > 0 Or InStr(s, "COND ISOL") > 0 Or _
       InStr(s, "ISOLADO") > 0 Then FamiliaPorLayer = "COND ISOLADO": Exit Function
    If InStr(s, "COND_NU") > 0 Or InStr(s, "COND NU") > 0 Or _
       InStr(s, "CABO_NU") > 0 Then FamiliaPorLayer = "COND NU": Exit Function
    If InStr(s, "POSTE_DT") > 0 Or InStr(s, "POSTEDT") > 0 Then _
       FamiliaPorLayer = "POSTE DT": Exit Function
    If InStr(s, "POSTE") > 0 Then FamiliaPorLayer = "POSTE CIRCULAR": Exit Function
    If InStr(s, "ESTRUT") > 0 Then FamiliaPorLayer = "ESTRUTURA MT": Exit Function
    FamiliaPorLayer = ""
End Function

' Converte score numerico em texto Alta/Media/Baixa.
Private Function NivelConfianca(ByVal score As Integer) As String
    If score >= 70 Then
        NivelConfianca = "Alta"
    ElseIf score >= 45 Then
        NivelConfianca = "Media"
    Else
        NivelConfianca = "Baixa"
    End If
End Function

' =============================================================================
'  AUXILIARES DO RESUMO
' =============================================================================
Private Function ExtrairAlturaPoste(ByVal txt As String) As Double
    Dim s As String, i As Long, ch As String, num As String
    s = UCase$(Trim$(txt))
    If Left$(s, 2) = "DT" Then
        s = Mid$(s, 3)
    ElseIf Left$(s, 1) = "C" Or Left$(s, 1) = "M" Or Left$(s, 1) = "V" Then
        s = Mid$(s, 2)
    End If
    num = ""
    For i = 1 To Len(s)
        ch = Mid$(s, i, 1)
        If ch >= "0" And ch <= "9" Then
            num = num & ch
        ElseIf ch = " " And Len(num) = 0 Then
            ' pula espacos iniciais
        Else
            Exit For
        End If
    Next i
    If Len(num) > 0 Then
        ExtrairAlturaPoste = CDbl(num)
    Else
        ExtrairAlturaPoste = 0
    End If
End Function

Private Function ExtrairMetrosCabo(ByVal txt As String) As Double
    Dim s As String, i As Long, ch As String, num As String
    s = Trim$(txt)
    num = ""
    For i = 1 To Len(s)
        ch = Mid$(s, i, 1)
        If ch >= "0" And ch <= "9" Then
            num = num & ch
        ElseIf (ch = "m" Or ch = "M") And Len(num) > 0 Then
            ExtrairMetrosCabo = CDbl(num)
            Exit Function
        Else
            num = ""
        End If
    Next i
    ExtrairMetrosCabo = 0
End Function

Private Function NormalizarCabo(ByVal txt As String) As String
    Dim s As String, i As Long, ch As String
    s = Trim$(txt)
    i = 1
    Do While i <= Len(s)
        ch = Mid$(s, i, 1)
        If ch >= "0" And ch <= "9" Then
            i = i + 1
        Else
            Exit Do
        End If
    Loop
    If i > 1 And i <= Len(s) Then
        If UCase$(Mid$(s, i, 1)) = "M" Then
            s = Trim$(Mid$(s, i + 1))
        End If
    End If
    Do While InStr(s, "  ") > 0
        s = Replace(s, "  ", " ")
    Loop
    s = Replace(s, "# CAA", "#CAA")
    s = Replace(s, "#CAA ", "#CAA")
    NormalizarCabo = UCase$(s)
End Function

Private Function NormalizarChave(ByVal txt As String) As String
    Dim s As String
    s = UCase$(Trim$(txt))
    Do While InStr(s, "  ") > 0
        s = Replace(s, "  ", " ")
    Loop
    NormalizarChave = s
End Function

Private Function EscreverSecao(ws As Object, ByVal startRow As Long, _
                                ByVal titulo As String, _
                                ByVal cabecalhos As Variant) As Long
    Dim r As Long, nCols As Long, j As Long
    r = startRow
    nCols = UBound(cabecalhos) - LBound(cabecalhos) + 1
    ws.Cells(r, 1).Value = titulo
    With ws.Range(ws.Cells(r, 1), ws.Cells(r, nCols))
        .Merge
        .Font.Bold = True
        .Font.Size = 12
        .Interior.Color = RGB(68, 114, 196)
        .Font.Color = RGB(255, 255, 255)
        .HorizontalAlignment = -4131
    End With
    r = r + 1
    For j = 0 To nCols - 1
        ws.Cells(r, j + 1).Value = cabecalhos(j)
    Next j
    With ws.Range(ws.Cells(r, 1), ws.Cells(r, nCols))
        .Font.Bold = True
        .Interior.Color = RGB(189, 215, 238)
        .Borders.LineStyle = 1
    End With
    r = r + 1
    EscreverSecao = r
End Function

Private Sub OrdenarStringsAsc(ByRef arr As Variant)
    Dim i As Long, j As Long, tmp As Variant
    Dim lo As Long, hi As Long
    lo = LBound(arr)
    hi = UBound(arr)
    For i = lo To hi - 1
        For j = lo To hi - 1 - (i - lo)
            If CStr(arr(j)) > CStr(arr(j + 1)) Then
                tmp = arr(j)
                arr(j) = arr(j + 1)
                arr(j + 1) = tmp
            End If
        Next j
    Next i
End Sub

Private Sub OrdenarStringsDesc(ByRef arr As Variant, ByRef dict As Object)
    Dim i As Long, j As Long, tmp As Variant
    Dim lo As Long, hi As Long
    lo = LBound(arr)
    hi = UBound(arr)
    For i = lo To hi - 1
        For j = lo To hi - 1 - (i - lo)
            If CDbl(dict(arr(j))) < CDbl(dict(arr(j + 1))) Then
                tmp = arr(j)
                arr(j) = arr(j + 1)
                arr(j + 1) = tmp
            End If
        Next j
    Next i
End Sub

Private Sub OrdenarChavesAlturaAsc(ByRef arr As Variant)
    Dim i As Long, j As Long, tmp As Variant
    Dim lo As Long, hi As Long
    lo = LBound(arr)
    hi = UBound(arr)
    For i = lo To hi - 1
        For j = lo To hi - 1 - (i - lo)
            If ValorAltura(arr(j)) > ValorAltura(arr(j + 1)) Then
                tmp = arr(j)
                arr(j) = arr(j + 1)
                arr(j + 1) = tmp
            End If
        Next j
    Next i
End Sub

Private Function ValorAltura(ByVal s As String) As Double
    Dim t As String, i As Long, ch As String, num As String
    t = CStr(s)
    num = ""
    For i = 1 To Len(t)
        ch = Mid$(t, i, 1)
        If (ch >= "0" And ch <= "9") Or ch = "." Or ch = "," Then
            If ch = "," Then ch = "."
            num = num & ch
        Else
            Exit For
        End If
    Next i
    If Len(num) = 0 Then
        ValorAltura = 99999
    Else
        ValorAltura = CDbl(num)
    End If
End Function

' =============================================================================
'  CRIA ABA FILTRADA POR STATUS
' =============================================================================
Private Sub CriarAbaStatus(ByVal wb As Object, ByVal wsAntes As Object, _
                            ByVal nomeAba As String, ByVal statusFiltro As String, _
                            ByRef arrLayer() As String, ByRef arrAci() As Integer, _
                            ByRef arrCor() As String, ByRef arrTexto() As String, _
                            ByRef arrFam() As String, ByRef arrStatus() As String, _
                            ByRef arrX() As Double, ByRef arrY() As Double, _
                            ByRef arrH() As Double, ByVal nTotal As Long, _
                            ByRef bTipo() As String, ByRef bBloco() As String, _
                            ByRef bStat() As String, ByRef bNum() As String, _
                            ByRef bDesc() As String, ByRef bBase() As String, _
                            ByRef bDist() As String, ByRef bMet() As Double, _
                            ByRef bBX() As Double, ByRef bBY() As Double, _
                            ByVal nBloco As Long)
    Dim ws As Object
    Set ws = wb.Worksheets.Add(After:=wsAntes)
    ws.Name = nomeAba

    ' Colunas de texto como TEXTO (evita erro 1004 com valores iniciados
    ' por '=', '+', '-' ou '@', que o Excel tentaria virar formula).
    ws.Columns("A:F").NumberFormat = "@"

    Dim corTitulo As Long
    Select Case statusFiltro
        Case "MATERIAIS INSTALADOS":     corTitulo = RGB(0, 112, 0)
        Case "MATERIAIS DESINSTALADOS":  corTitulo = RGB(180, 0, 0)
        Case "MATERIAIS EXISTENTES":     corTitulo = RGB(0, 70, 140)
        Case Else:                       corTitulo = RGB(80, 80, 80)
    End Select

    ' --- Secao de BLOCOS deste status (unica tabela da aba) ---------------
    Dim rb As Long, cabRow As Long, i As Long
    rb = 1
    ws.Cells(rb, 1).Value = "BLOCOS (" & statusFiltro & ")"
    With ws.Range(ws.Cells(rb, 1), ws.Cells(rb, 9))
        .Merge
        .Font.Bold = True
        .Font.Size = 12
        .Font.Color = RGB(255, 255, 255)
        .Interior.Color = corTitulo
    End With
    rb = rb + 1

    cabRow = rb
    ws.Cells(rb, 1).Value = "Tipo"
    ws.Cells(rb, 2).Value = "Bloco"
    ws.Cells(rb, 3).Value = "Numero"
    ws.Cells(rb, 4).Value = "Descricao"
    ws.Cells(rb, 5).Value = "Nome Base/Familia"
    ws.Cells(rb, 6).Value = "Distancia"
    ws.Cells(rb, 7).Value = "Metros"
    ws.Cells(rb, 8).Value = "X"
    ws.Cells(rb, 9).Value = "Y"
    With ws.Range(ws.Cells(rb, 1), ws.Cells(rb, 9))
        .Font.Bold = True
        .Interior.Color = RGB(220, 230, 241)
        .Borders.LineStyle = 1
    End With
    rb = rb + 1

    Dim cntB As Long
    cntB = 0
    For i = 1 To nBloco
        If bStat(i) = statusFiltro Then
            ws.Cells(rb, 1).Value = bTipo(i)
            ws.Cells(rb, 2).Value = bBloco(i)
            ws.Cells(rb, 3).Value = bNum(i)
            ws.Cells(rb, 4).Value = bDesc(i)
            ws.Cells(rb, 5).Value = bBase(i)
            ws.Cells(rb, 6).Value = bDist(i)
            ws.Cells(rb, 7).Value = bMet(i)
            ws.Cells(rb, 8).Value = bBX(i)
            ws.Cells(rb, 9).Value = bBY(i)
            rb = rb + 1
            cntB = cntB + 1
        End If
    Next i
    If cntB = 0 Then
        ws.Cells(rb, 1).Value = "(nenhum bloco neste status)"
        ws.Cells(rb, 1).Font.Italic = True
    Else
        ws.Range(ws.Cells(cabRow, 1), ws.Cells(rb - 1, 9)).Columns.AutoFit
        ws.Range(ws.Cells(cabRow, 1), ws.Cells(cabRow, 9)).AutoFilter
    End If
End Sub

' =============================================================================
'  ADICIONA GRAFICOS NA ABA RESUMO
'  Os dados auxiliares ficam em colunas ocultas (P e R) da propria aba.
' =============================================================================
Private Sub AdicionarGraficos(ByVal ws2 As Object, _
                               ByVal totFam As Object, _
                               ByVal totStatus As Object, _
                               ByVal primeiraLinhaLivre As Long)

    ' --- Constantes de coluna para dados auxiliares dos graficos
    Const C_FAM_KEY = 16    ' Coluna P: label familia
    Const C_FAM_VAL = 17    ' Coluna Q: valor familia
    Const C_STA_KEY = 19    ' Coluna S: label status
    Const C_STA_VAL = 20    ' Coluna T: valor status

    ' Escreve dados de familias
    Dim k As Variant, famRow As Long, statRow As Long
    Dim allFamKeys As Variant
    allFamKeys = totFam.Keys
    Call OrdenarStringsDesc(allFamKeys, totFam)

    ws2.Cells(1, C_FAM_KEY).Value = "Familia"
    ws2.Cells(1, C_FAM_VAL).Value = "Quantidade"
    famRow = 2
    For Each k In allFamKeys
        ws2.Cells(famRow, C_FAM_KEY).Value = CStr(k)
        ws2.Cells(famRow, C_FAM_VAL).Value = CDbl(totFam(k))
        famRow = famRow + 1
    Next k

    ' Escreve dados de status
    ws2.Cells(1, C_STA_KEY).Value = "Status"
    ws2.Cells(1, C_STA_VAL).Value = "Quantidade"
    statRow = 2
    For Each k In totStatus.Keys
        ws2.Cells(statRow, C_STA_KEY).Value = CStr(k)
        ws2.Cells(statRow, C_STA_VAL).Value = CDbl(totStatus(k))
        statRow = statRow + 1
    Next k

    ' Posiciona graficos a partir da coluna H, linha 3
    Dim leftPos As Double, topBase As Double
    leftPos = ws2.Cells(1, 8).Left
    topBase = ws2.Cells(3, 1).Top

    ' --- Grafico 1: Barras horizontais por familia
    Dim co1 As Object
    Set co1 = ws2.ChartObjects.Add(leftPos, topBase, 430, 300)
    With co1.Chart
        .ChartType = 57  ' xlBarClustered
        .SetSourceData ws2.Range(ws2.Cells(1, C_FAM_KEY), _
                                 ws2.Cells(famRow - 1, C_FAM_VAL))
        .PlotBy = 2      ' xlColumns
        .HasTitle = True
        .ChartTitle.Text = "Total por Familia de Material"
        .HasLegend = False
    End With

    ' --- Grafico 2: Pizza por status
    If statRow > 2 Then
        Dim co2 As Object
        Set co2 = ws2.ChartObjects.Add(leftPos + 440, topBase, 340, 300)
        With co2.Chart
            .ChartType = 5   ' xlPie
            .SetSourceData ws2.Range(ws2.Cells(1, C_STA_KEY), _
                                     ws2.Cells(statRow - 1, C_STA_VAL))
            .PlotBy = 2
            .HasTitle = True
            .ChartTitle.Text = "Distribuicao por Status"
            .ApplyDataLabels
            On Error Resume Next
            With .SeriesCollection(1).DataLabels
                .ShowPercentage = True
                .ShowValue = False
                .ShowCategoryName = True
            End With
            On Error GoTo 0
        End With
    End If

    ' Oculta colunas auxiliares
    ws2.Range(ws2.Cells(1, C_FAM_KEY), ws2.Cells(1, C_STA_VAL)) _
       .EntireColumn.Hidden = True
End Sub

' =============================================================================
'  CAMADA 2 - ABA ALERTAS / INCONSISTENCIAS
'  -----------------------------------------------------------------------------
'  Detecta:
'    A) Textos com Confianca Baixa
'    B) Familia CLASSIFICAR (nao reconhecida)
'    C) Coordenadas duplicadas (textos sobrepostos no mesmo X,Y)
'    D) Status NAO CLASSIFICADO
'    E) Mesmo poste (nome base) em layers com status conflitantes
' =============================================================================
Private Sub CriarAbaAlertas(ByVal wb As Object, _
                             ByRef arrLayer() As String, _
                             ByRef arrStatus() As String, _
                             ByRef arrFam() As String, _
                             ByRef arrTexto() As String, _
                             ByRef arrNomeBase() As String, _
                             ByRef arrConfianca() As String, _
                             ByRef arrX() As Double, _
                             ByRef arrY() As Double, _
                             ByVal n As Long)
    Dim ws As Object
    Set ws = wb.Worksheets.Add(After:=wb.Worksheets(wb.Worksheets.Count))
    ws.Name = "Alertas"

    ' Cabecalho geral
    ws.Cells(1, 1).Value = "ALERTAS E INCONSISTENCIAS"
    With ws.Range(ws.Cells(1, 1), ws.Cells(1, 6))
        .Merge
        .Font.Bold = True
        .Font.Size = 14
        .HorizontalAlignment = -4108
        .Interior.Color = RGB(192, 0, 0)
        .Font.Color = RGB(255, 255, 255)
    End With

    Dim row As Long
    row = 3

    ' --- A) Confianca Baixa -----------------------------------------------
    ws.Cells(row, 1).Value = "A) Itens com confianca BAIXA na classificacao"
    ws.Cells(row, 1).Font.Bold = True
    ws.Cells(row, 1).Font.Color = RGB(192, 0, 0)
    row = row + 1
    ws.Cells(row, 1).Value = "Layer"
    ws.Cells(row, 2).Value = "Status"
    ws.Cells(row, 3).Value = "Familia"
    ws.Cells(row, 4).Value = "Conteudo"
    ws.Cells(row, 5).Value = "Confianca"
    With ws.Range(ws.Cells(row, 1), ws.Cells(row, 5))
        .Font.Bold = True
        .Interior.Color = RGB(220, 230, 241)
    End With
    row = row + 1
    Dim i As Long, totA As Long
    totA = 0
    For i = 1 To n
        If arrConfianca(i) = "Baixa" Then
            ws.Cells(row, 1).Value = arrLayer(i)
            ws.Cells(row, 2).Value = arrStatus(i)
            ws.Cells(row, 3).Value = arrFam(i)
            ws.Cells(row, 4).Value = arrTexto(i)
            ws.Cells(row, 5).Value = arrConfianca(i)
            ws.Cells(row, 5).Interior.Color = RGB(255, 199, 206)
            row = row + 1
            totA = totA + 1
        End If
    Next i
    If totA = 0 Then
        ws.Cells(row, 1).Value = "(nenhum)"
        ws.Cells(row, 1).Font.Italic = True
        row = row + 1
    End If
    row = row + 2

    ' --- B) Familia CLASSIFICAR -------------------------------------------
    ws.Cells(row, 1).Value = "B) Textos nao classificados (familia = CLASSIFICAR)"
    ws.Cells(row, 1).Font.Bold = True
    ws.Cells(row, 1).Font.Color = RGB(192, 0, 0)
    row = row + 1
    ws.Cells(row, 1).Value = "Layer"
    ws.Cells(row, 2).Value = "Status"
    ws.Cells(row, 3).Value = "Conteudo"
    With ws.Range(ws.Cells(row, 1), ws.Cells(row, 3))
        .Font.Bold = True
        .Interior.Color = RGB(220, 230, 241)
    End With
    row = row + 1
    Dim totB As Long
    totB = 0
    For i = 1 To n
        If arrFam(i) = "CLASSIFICAR" Then
            ws.Cells(row, 1).Value = arrLayer(i)
            ws.Cells(row, 2).Value = arrStatus(i)
            ws.Cells(row, 3).Value = arrTexto(i)
            row = row + 1
            totB = totB + 1
        End If
    Next i
    If totB = 0 Then
        ws.Cells(row, 1).Value = "(nenhum)"
        ws.Cells(row, 1).Font.Italic = True
        row = row + 1
    End If
    row = row + 2

    ' --- C) Coordenadas duplicadas ----------------------------------------
    '  Considera duplicada quando dois textos compartilham o mesmo X,Y
    '  arredondado a 0.01 unidade do desenho.
    ws.Cells(row, 1).Value = "C) Textos com coordenadas X,Y identicas (sobreposicoes)"
    ws.Cells(row, 1).Font.Bold = True
    ws.Cells(row, 1).Font.Color = RGB(192, 0, 0)
    row = row + 1
    ws.Cells(row, 1).Value = "X"
    ws.Cells(row, 2).Value = "Y"
    ws.Cells(row, 3).Value = "Layer"
    ws.Cells(row, 4).Value = "Familia"
    ws.Cells(row, 5).Value = "Conteudo"
    With ws.Range(ws.Cells(row, 1), ws.Cells(row, 5))
        .Font.Bold = True
        .Interior.Color = RGB(220, 230, 241)
    End With
    row = row + 1
    Dim dupMap As Object
    Set dupMap = CreateObject("Scripting.Dictionary")
    Dim k As String
    For i = 1 To n
        k = Format$(arrX(i), "0.00") & "|" & Format$(arrY(i), "0.00")
        If dupMap.Exists(k) Then
            dupMap(k) = dupMap(k) & ";" & i
        Else
            dupMap.Add k, CStr(i)
        End If
    Next i
    Dim ks As Variant, kv As Variant, idxs() As String, j As Long, idx As Long
    Dim totC As Long
    totC = 0
    For Each ks In dupMap.Keys
        idxs = Split(CStr(dupMap(ks)), ";")
        If UBound(idxs) >= 1 Then  ' tem 2 ou mais no mesmo ponto
            For j = 0 To UBound(idxs)
                idx = CLng(idxs(j))
                ws.Cells(row, 1).Value = arrX(idx)
                ws.Cells(row, 2).Value = arrY(idx)
                ws.Cells(row, 3).Value = arrLayer(idx)
                ws.Cells(row, 4).Value = arrFam(idx)
                ws.Cells(row, 5).Value = arrTexto(idx)
                row = row + 1
                totC = totC + 1
            Next j
        End If
    Next ks
    If totC = 0 Then
        ws.Cells(row, 1).Value = "(nenhum)"
        ws.Cells(row, 1).Font.Italic = True
        row = row + 1
    End If
    row = row + 2

    ' --- D) Status NAO CLASSIFICADO ---------------------------------------
    ws.Cells(row, 1).Value = "D) Layers fora dos 3 status conhecidos"
    ws.Cells(row, 1).Font.Bold = True
    ws.Cells(row, 1).Font.Color = RGB(192, 0, 0)
    row = row + 1
    ws.Cells(row, 1).Value = "Layer"
    ws.Cells(row, 2).Value = "Familia"
    ws.Cells(row, 3).Value = "Conteudo"
    With ws.Range(ws.Cells(row, 1), ws.Cells(row, 3))
        .Font.Bold = True
        .Interior.Color = RGB(220, 230, 241)
    End With
    row = row + 1
    Dim totD As Long
    totD = 0
    For i = 1 To n
        If arrStatus(i) = "NAO CLASSIFICADO" Then
            ws.Cells(row, 1).Value = arrLayer(i)
            ws.Cells(row, 2).Value = arrFam(i)
            ws.Cells(row, 3).Value = arrTexto(i)
            row = row + 1
            totD = totD + 1
        End If
    Next i
    If totD = 0 Then
        ws.Cells(row, 1).Value = "(nenhum)"
        ws.Cells(row, 1).Font.Italic = True
        row = row + 1
    End If
    row = row + 2

    ' --- E) Mesmo poste em status conflitantes ----------------------------
    ws.Cells(row, 1).Value = "E) Mesmo nome base de poste com status conflitantes"
    ws.Cells(row, 1).Font.Bold = True
    ws.Cells(row, 1).Font.Color = RGB(192, 0, 0)
    row = row + 1
    ws.Cells(row, 1).Value = "Nome Base"
    ws.Cells(row, 2).Value = "Status conflitantes"
    With ws.Range(ws.Cells(row, 1), ws.Cells(row, 2))
        .Font.Bold = True
        .Interior.Color = RGB(220, 230, 241)
    End With
    row = row + 1
    Dim posteStatus As Object
    Set posteStatus = CreateObject("Scripting.Dictionary")
    For i = 1 To n
        If Len(arrNomeBase(i)) > 0 Then
            k = arrNomeBase(i) & " @ " & Format$(arrX(i), "0") & _
                "," & Format$(arrY(i), "0")
            ' agrupa por nome base apenas (mais sensivel)
            If posteStatus.Exists(arrNomeBase(i)) Then
                If InStr(posteStatus(arrNomeBase(i)), arrStatus(i)) = 0 Then
                    posteStatus(arrNomeBase(i)) = _
                        posteStatus(arrNomeBase(i)) & " / " & arrStatus(i)
                End If
            Else
                posteStatus.Add arrNomeBase(i), arrStatus(i)
            End If
        End If
    Next i
    Dim totE As Long
    totE = 0
    For Each kv In posteStatus.Keys
        If InStr(posteStatus(kv), "/") > 0 Then
            ws.Cells(row, 1).Value = kv
            ws.Cells(row, 2).Value = posteStatus(kv)
            row = row + 1
            totE = totE + 1
        End If
    Next kv
    If totE = 0 Then
        ws.Cells(row, 1).Value = "(nenhum)"
        ws.Cells(row, 1).Font.Italic = True
        row = row + 1
    End If

    ' --- Resumo no topo ---------------------------------------------------
    ws.Cells(2, 1).Value = "Confianca baixa: " & totA & _
                           "   |   Nao classificados: " & totB & _
                           "   |   Sobreposicoes: " & totC & _
                           "   |   Status desconhecido: " & totD & _
                           "   |   Conflitos de poste: " & totE
    ws.Cells(2, 1).Font.Italic = True

    ws.Columns("A").ColumnWidth = 32
    ws.Columns("B").ColumnWidth = 24
    ws.Columns("C").ColumnWidth = 22
    ws.Columns("D").ColumnWidth = 32
    ws.Columns("E").ColumnWidth = 16
End Sub

' =============================================================================
'  CAMADA 3 - VINCULO POR PROXIMIDADE
'  -----------------------------------------------------------------------------
'  Para cada item que NAO eh um poste, encontra o poste mais proximo (em
'  distancia euclidiana X,Y) e devolve o NOME BASE desse poste + a distancia.
'  Postes "vinculam" com eles mesmos (distancia 0).
' =============================================================================
Private Sub CalcularProximidade(ByRef arrFam() As String, _
                                  ByRef arrNomeBase() As String, _
                                  ByRef arrX() As Double, _
                                  ByRef arrY() As Double, _
                                  ByVal n As Long, _
                                  ByRef outPoste() As String, _
                                  ByRef outDist() As Double)
    Dim i As Long, j As Long
    Dim minDist As Double, d As Double, dx As Double, dy As Double
    Dim minIdx As Long
    For i = 1 To n
        If arrFam(i) = "POSTE CIRCULAR" Or arrFam(i) = "POSTE DT" Then
            outPoste(i) = arrNomeBase(i)
            outDist(i) = 0
        Else
            minDist = 1E+18
            minIdx = 0
            For j = 1 To n
                If j <> i Then
                    If arrFam(j) = "POSTE CIRCULAR" Or arrFam(j) = "POSTE DT" Then
                        If Len(arrNomeBase(j)) > 0 Then
                            dx = arrX(i) - arrX(j)
                            dy = arrY(i) - arrY(j)
                            d = dx * dx + dy * dy  ' usa quadrado por performance
                            If d < minDist Then
                                minDist = d
                                minIdx = j
                            End If
                        End If
                    End If
                End If
            Next j
            If minIdx > 0 Then
                outPoste(i) = arrNomeBase(minIdx)
                outDist(i) = Sqr(minDist)
            Else
                outPoste(i) = ""
                outDist(i) = 0
            End If
        End If
    Next i
End Sub

Private Sub CriarAbaVinculos(ByVal wb As Object, _
                              ByRef arrLayer() As String, _
                              ByRef arrStatus() As String, _
                              ByRef arrFam() As String, _
                              ByRef arrTexto() As String, _
                              ByRef arrNomeBase() As String, _
                              ByRef arrPosteProximo() As String, _
                              ByRef arrDistPoste() As Double, _
                              ByRef arrX() As Double, _
                              ByRef arrY() As Double, _
                              ByVal n As Long)
    Dim ws As Object
    Set ws = wb.Worksheets.Add(After:=wb.Worksheets(wb.Worksheets.Count))
    ws.Name = "Vinculos"

    ws.Cells(1, 1).Value = "VINCULOS POR PROXIMIDADE (poste mais proximo de cada item)"
    With ws.Range(ws.Cells(1, 1), ws.Cells(1, 8))
        .Merge
        .Font.Bold = True
        .Font.Size = 14
        .HorizontalAlignment = -4108
        .Interior.Color = RGB(31, 78, 120)
        .Font.Color = RGB(255, 255, 255)
    End With

    ws.Cells(3, 1).Value = "Layer"
    ws.Cells(3, 2).Value = "Status"
    ws.Cells(3, 3).Value = "Familia"
    ws.Cells(3, 4).Value = "Conteudo"
    ws.Cells(3, 5).Value = "Poste Mais Proximo"
    ws.Cells(3, 6).Value = "Distancia"
    ws.Cells(3, 7).Value = "X"
    ws.Cells(3, 8).Value = "Y"
    With ws.Range(ws.Cells(3, 1), ws.Cells(3, 8))
        .Font.Bold = True
        .Interior.Color = RGB(220, 230, 241)
    End With

    Dim r As Long, i As Long
    r = 4
    For i = 1 To n
        ws.Cells(r, 1).Value = arrLayer(i)
        ws.Cells(r, 2).Value = arrStatus(i)
        ws.Cells(r, 3).Value = arrFam(i)
        ws.Cells(r, 4).Value = arrTexto(i)
        ws.Cells(r, 5).Value = arrPosteProximo(i)
        ws.Cells(r, 6).Value = arrDistPoste(i)
        ws.Cells(r, 7).Value = arrX(i)
        ws.Cells(r, 8).Value = arrY(i)
        r = r + 1
    Next i

    ws.Range("A3:H3").AutoFilter
    ws.Columns("A").ColumnWidth = 24
    ws.Columns("B").ColumnWidth = 22
    ws.Columns("C").ColumnWidth = 18
    ws.Columns("D").ColumnWidth = 32
    ws.Columns("E").ColumnWidth = 20
    ws.Columns("F").ColumnWidth = 12
    ws.Columns("G").ColumnWidth = 12
    ws.Columns("H").ColumnWidth = 12
End Sub

' =============================================================================
'  CAMADA 4 - ABA QUANTITATIVO DE OBRA (BOM)
'  -----------------------------------------------------------------------------
'  Para cada combinacao (Status, Familia, Descricao) soma a quantidade.
'  Para cabos, somatorio em metros. Para outros, contagem.
'  Layout: linhas agrupadas por STATUS (Instalados, Desinstalados, Existentes).
' =============================================================================
Private Sub CriarAbaBOM(ByVal wb As Object, _
                         ByRef arrLayer() As String, _
                         ByRef arrStatus() As String, _
                         ByRef arrFam() As String, _
                         ByRef arrTexto() As String, _
                         ByRef arrNomeBase() As String, _
                         ByVal n As Long)
    Dim ws As Object
    Set ws = wb.Worksheets.Add(After:=wb.Worksheets(wb.Worksheets.Count))
    ws.Name = "Quantitativo (BOM)"

    ws.Cells(1, 1).Value = "QUANTITATIVO DE OBRA (Bill of Materials)"
    With ws.Range(ws.Cells(1, 1), ws.Cells(1, 5))
        .Merge
        .Font.Bold = True
        .Font.Size = 14
        .HorizontalAlignment = -4108
        .Interior.Color = RGB(0, 112, 192)
        .Font.Color = RGB(255, 255, 255)
    End With
    ws.Cells(2, 1).Value = _
        "Para cabos, a quantidade representa a soma de METROS extraidos do texto."
    ws.Cells(2, 1).Font.Italic = True

    ' Agrega: dict[key] = qtd; key = "STATUS||FAMILIA||DESCRICAO"
    Dim agg As Object, qtdM As Object
    Set agg = CreateObject("Scripting.Dictionary")
    Set qtdM = CreateObject("Scripting.Dictionary")

    Dim i As Long, fam As String, st As String, cont As String
    Dim desc As String, key As String, eMetros As Boolean, m As Double
    For i = 1 To n
        st  = arrStatus(i)
        fam = arrFam(i)
        cont = arrTexto(i)
        eMetros = (fam = "COND NU" Or fam = "COND ISOLADO")

        ' Descricao normalizada por familia
        Select Case fam
            Case "POSTE CIRCULAR", "POSTE DT"
                desc = arrNomeBase(i)
                If Len(desc) = 0 Then desc = NormalizarChave(cont)
            Case "COND NU", "COND ISOLADO"
                desc = NormalizarCabo(cont)
            Case Else
                desc = NormalizarChave(cont)
        End Select

        key = st & "||" & fam & "||" & desc

        If eMetros Then
            m = ExtrairMetrosCabo(cont)
            If agg.Exists(key) Then
                agg(key) = agg(key) + 1
                qtdM(key) = qtdM(key) + m
            Else
                agg.Add key, 1
                qtdM.Add key, m
            End If
        Else
            If agg.Exists(key) Then
                agg(key) = agg(key) + 1
            Else
                agg.Add key, 1
                qtdM.Add key, 0
            End If
        End If
    Next i

    ' --- Escreve cabecalho ------------------------------------------------
    Dim row As Long
    row = 4
    ws.Cells(row, 1).Value = "Status"
    ws.Cells(row, 2).Value = "Familia"
    ws.Cells(row, 3).Value = "Descricao / Modelo"
    ws.Cells(row, 4).Value = "Qtd / Trechos"
    ws.Cells(row, 5).Value = "Metros (cabos)"
    With ws.Range(ws.Cells(row, 1), ws.Cells(row, 5))
        .Font.Bold = True
        .Interior.Color = RGB(220, 230, 241)
        .Borders.LineStyle = 1
    End With
    row = row + 1

    ' --- Escreve agrupado por status na ordem desejada --------------------
    Dim statusOrdem As Variant
    statusOrdem = Array("MATERIAIS INSTALADOS", "MATERIAIS DESINSTALADOS", _
                        "MATERIAIS EXISTENTES", "NAO CLASSIFICADO")
    Dim s As Variant, kk As Variant, partes() As String
    Dim corStatus As Long
    For Each s In statusOrdem
        Select Case s
            Case "MATERIAIS INSTALADOS":    corStatus = RGB(226, 239, 218)
            Case "MATERIAIS DESINSTALADOS": corStatus = RGB(252, 228, 214)
            Case "MATERIAIS EXISTENTES":    corStatus = RGB(217, 226, 243)
            Case Else:                       corStatus = RGB(220, 220, 220)
        End Select

        Dim achouAlgo As Boolean
        achouAlgo = False
        Dim subQtd As Long, subM As Double
        subQtd = 0
        subM = 0

        Dim keysArr As Variant
        keysArr = agg.Keys
        Call OrdenarStringsAsc(keysArr)
        For Each kk In keysArr
            partes = Split(CStr(kk), "||")
            If partes(0) = CStr(s) Then
                ws.Cells(row, 1).Value = partes(0)
                ws.Cells(row, 2).Value = partes(1)
                ws.Cells(row, 3).Value = partes(2)
                ws.Cells(row, 4).Value = agg(kk)
                subQtd = subQtd + CLng(agg(kk))
                If qtdM(kk) > 0 Then
                    ws.Cells(row, 5).Value = qtdM(kk)
                    subM = subM + CDbl(qtdM(kk))
                End If
                ws.Cells(row, 1).Interior.Color = corStatus
                row = row + 1
                achouAlgo = True
            End If
        Next kk

        If achouAlgo Then
            ws.Cells(row, 1).Value = "Subtotal " & s
            ws.Cells(row, 4).Value = subQtd
            If subM > 0 Then ws.Cells(row, 5).Value = subM
            With ws.Range(ws.Cells(row, 1), ws.Cells(row, 5))
                .Font.Bold = True
                .Interior.Color = RGB(255, 230, 153)
            End With
            row = row + 2
        End If
    Next s

    ws.Range("A4:E4").AutoFilter
    ws.Columns("A").ColumnWidth = 26
    ws.Columns("B").ColumnWidth = 18
    ws.Columns("C").ColumnWidth = 36
    ws.Columns("D").ColumnWidth = 14
    ws.Columns("E").ColumnWidth = 16
End Sub

' =============================================================================
'  LEITURA DE BLOCOS COM ATRIBUTOS (v3.1)
'  -----------------------------------------------------------------------------
'  Varre todos os INSERTs (BlockReference) em todos os layouts, extrai os
'  atributos relevantes e popula os arrays paralelos passados por referencia.
'
'  Atributos reconhecidos por tag (case-insensitive, com tolerancia a acento):
'    NUMERO / N      -> bNumero
'    EXISTENTE       -> bExistente
'    PROJETADO       -> bProjetado
'    ESTAI           -> bEstai
'    OCUPANT*        -> bOcupantes
'    COORDENADA / Z  -> bCoordZ
'
'  Filtros:
'   - Pula blocos do tipo "*Model_Space", "*Paper_Space", "*Layout*"
'   - Pula blocos sem nenhum atributo (essencialmente "anonimos")
'   - Aceita blocos cujo nome comeca com RDARA, RDPRD, POSTE, BLK_POSTE, ou
'     que possuem ao menos um atributo entre NUMERO/EXISTENTE/PROJETADO
'     (heuristica: e mais provavel ser um poste se tem essa estrutura)
' =============================================================================
Private Sub LerBlocosComAtributos(ByRef bnome() As String, _
                                    ByRef blayer() As String, _
                                    ByRef bstatus() As String, _
                                    ByRef bNumero() As String, _
                                    ByRef bExistente() As String, _
                                    ByRef bProjetado() As String, _
                                    ByRef bEstai() As String, _
                                    ByRef bOcupantes() As String, _
                                    ByRef bCoordZ() As String, _
                                    ByRef bX() As Double, _
                                    ByRef bY() As Double, _
                                    ByRef bNomeBaseExist() As String, _
                                    ByRef bNomeBaseProj() As String, _
                                    ByRef nB As Long)
    Dim cap As Long
    cap = 256
    ReDim bnome(1 To cap)
    ReDim blayer(1 To cap)
    ReDim bstatus(1 To cap)
    ReDim bNumero(1 To cap)
    ReDim bExistente(1 To cap)
    ReDim bProjetado(1 To cap)
    ReDim bEstai(1 To cap)
    ReDim bOcupantes(1 To cap)
    ReDim bCoordZ(1 To cap)
    ReDim bX(1 To cap)
    ReDim bY(1 To cap)
    ReDim bNomeBaseExist(1 To cap)
    ReDim bNomeBaseProj(1 To cap)
    nB = 0

    Dim sp As Object, ent As Object
    For Each sp In ThisDrawing.Blocks
        ' Aceita layouts E o ModelSpace propriamente
        If EhEspacoParaLer(sp) Then
            For Each ent In sp
                Dim tipo As String
                tipo = ent.ObjectName
                ' INSERT em ZWCAD/AutoCAD: AcDbBlockReference / ZcDbBlockReference
                If InStr(tipo, "BlockReference") > 0 Then
                    Dim nomeBlk As String
                    nomeBlk = ""
                    On Error Resume Next
                    nomeBlk = ent.Name
                    If Err.Number <> 0 Then
                        Err.Clear
                        nomeBlk = ent.EffectiveName  ' alguns provedores expoem isso
                    End If
                    On Error GoTo 0
                    If Len(nomeBlk) = 0 Then GoTo ContinuaBlk

                    ' Pula blocos de layout/papel
                    Dim nomeU As String
                    nomeU = UCase$(nomeBlk)
                    If Left$(nomeU, 1) = "*" Then GoTo ContinuaBlk
                    If InStr(nomeU, "MODEL_SPACE") > 0 Then GoTo ContinuaBlk
                    If InStr(nomeU, "PAPER_SPACE") > 0 Then GoTo ContinuaBlk

                    ' Atributos do bloco
                    Dim temAtributo As Boolean
                    temAtributo = False
                    On Error Resume Next
                    temAtributo = ent.HasAttributes
                    On Error GoTo 0
                    If Not temAtributo Then GoTo ContinuaBlk

                    ' Coleta atributos
                    Dim vNum As String, vExt As String, vPrj As String
                    Dim vEst As String, vOcu As String, vCoz As String
                    vNum = "" : vExt = "" : vPrj = "" : vEst = "" : vOcu = "" : vCoz = ""
                    ' Atributos especificos para RDARA121 (cabo a instalar)
                    Dim vTCabo121 As String, vDist121 As String
                    vTCabo121 = "" : vDist121 = ""

                    Dim atrs As Variant
                    On Error Resume Next
                    atrs = ent.GetAttributes
                    If Err.Number <> 0 Then
                        Err.Clear
                        GoTo ContinuaBlk
                    End If
                    On Error GoTo 0

                    Dim i As Long, tg As String, vl As String
                    Dim temHashPoste As Boolean
                    temHashPoste = False
                    For i = LBound(atrs) To UBound(atrs)
                        On Error Resume Next
                        tg = UCase$(Trim$(CStr(atrs(i).TagString)))
                        vl = Trim$(CStr(atrs(i).TextString))
                        On Error GoTo 0
                        ' Normaliza acento de NUMERO
                        tg = Replace(tg, "Ú", "U")
                        tg = Replace(tg, "Á", "A")

                        ' Detecta # no inicio de QUALQUER atributo
                        If ComecaComHashtag(vl) Then temHashPoste = True

                        Select Case True
                            Case (tg = "NUMERO" Or tg = "N" Or tg = "NUM" Or _
                                  InStr(tg, "NUMERO") > 0)
                                vNum = vl
                            Case InStr(tg, "EXISTENTE") > 0
                                vExt = vl
                            Case InStr(tg, "PROJETADO") > 0 Or _
                                 InStr(tg, "PROJ") > 0 Or _
                                 InStr(tg, "INSTAL") > 0
                                vPrj = vl
                            Case InStr(tg, "ESTAI") > 0
                                vEst = vl
                            Case InStr(tg, "OCUPANT") > 0
                                vOcu = vl
                            Case InStr(tg, "COORD") > 0 Or tg = "Z"
                                vCoz = vl
                            Case tg = "TCABO" Or InStr(tg, "TCABO") > 0
                                vTCabo121 = vl
                            Case InStr(tg, "=DISTAN") > 0 Or _
                                 (InStr(tg, "DISTAN") > 0 And tg <> "DISTANCIA")
                                If Len(vl) > 0 Then vDist121 = vl
                            Case tg = "DISTANCIA"
                                If Len(vDist121) = 0 Then vDist121 = vl
                        End Select
                    Next i

                    ' RDARA120: cabo existente - TCABO + DISTANCIA, status EXISTENTES
                    If BlocoCasa(nomeU, "RDARA120") Then
                        Dim desc120 As String
                        desc120 = ""
                        If Len(vTCabo121) > 0 Then desc120 = vTCabo121
                        If Len(vDist121) > 0 Then
                            If Len(desc120) > 0 Then desc120 = desc120 & "  "
                            desc120 = desc120 & vDist121
                        End If
                        vPrj = desc120   ' so vPrj preenchido = exibido
                        vExt = ""
                    End If

                    ' RDARA121: monta descricao como "TCABO  DISTANCIA"
                    If BlocoCasa(nomeU, "RDARA121") Then
                        Dim desc121 As String
                        desc121 = ""
                        If Len(vTCabo121) > 0 Then desc121 = vTCabo121
                        If Len(vDist121) > 0 Then
                            If Len(desc121) > 0 Then desc121 = desc121 & "  "
                            desc121 = desc121 & vDist121
                        End If
                        vPrj = desc121   ' coloca em vPrj (so ele preenchido = exibido)
                        vExt = ""
                    End If

                    ' Heuristica: aceita postes; EXCLUI blocos de cabo.
                    Dim aceita As Boolean
                    aceita = False
                    If EhBlocoCabo(nomeBlk) Then GoTo ContinuaBlk
                    If EhBlocoPoste(nomeBlk) Then aceita = True
                    ' Outros RDARA com numero + estrutura (existente/projetada)
                    If Left$(nomeU, 5) = "RDARA" And Len(vNum) > 0 And _
                       (Len(vExt) > 0 Or Len(vPrj) > 0) Then aceita = True
                    If Not aceita Then GoTo ContinuaBlk

                    ' Cresce array se necessario
                    nB = nB + 1
                    If nB > cap Then
                        cap = cap * 2
                        ReDim Preserve bnome(1 To cap)
                        ReDim Preserve blayer(1 To cap)
                        ReDim Preserve bstatus(1 To cap)
                        ReDim Preserve bNumero(1 To cap)
                        ReDim Preserve bExistente(1 To cap)
                        ReDim Preserve bProjetado(1 To cap)
                        ReDim Preserve bEstai(1 To cap)
                        ReDim Preserve bOcupantes(1 To cap)
                        ReDim Preserve bCoordZ(1 To cap)
                        ReDim Preserve bX(1 To cap)
                        ReDim Preserve bY(1 To cap)
                        ReDim Preserve bNomeBaseExist(1 To cap)
                        ReDim Preserve bNomeBaseProj(1 To cap)
                    End If

                    Dim insP As Variant
                    On Error Resume Next
                    insP = ent.InsertionPoint
                    On Error GoTo 0
                    Dim px As Double, py As Double
                    px = 0 : py = 0
                    On Error Resume Next
                    px = CDbl(insP(0))
                    py = CDbl(insP(1))
                    On Error GoTo 0

                    Dim sb As String
                    sb = StatusPorBloco(nomeBlk)

                    If sb = "DUPLO" Then
                        ' Linha 2 (PROJETADO/A_INSTALAR): sempre INSTALADOS
                        ' Linha 1 (EXISTENTE):
                        '   RDARA034: "#" no inicio  OU ambos preenchidos -> DESINSTALADOS
                        '             caso contrario                       -> EXISTENTES
                        '   RDARA1100: ambos preenchidos -> DESINSTALADOS
                        '              so EXISTENTE      -> EXISTENTES
                        Dim statusL1 As String, statusL2 As String
                        statusL2 = "MATERIAIS INSTALADOS"
                        If BlocoCasa(nomeU, "RDARA034") Then
                            If ComecaComHashtag(vExt) Or (Len(vExt) > 0 And Len(vPrj) > 0) Then
                                statusL1 = "MATERIAIS DESINSTALADOS"
                            Else
                                statusL1 = "MATERIAIS EXISTENTES"
                            End If
                        Else
                            ' RDARA1100
                            If Len(vExt) > 0 And Len(vPrj) > 0 Then
                                statusL1 = "MATERIAIS DESINSTALADOS"
                            Else
                                statusL1 = "MATERIAIS EXISTENTES"
                            End If
                        End If
                        ' Linha 1: estrutura EXISTENTE
                        bnome(nB)          = nomeBlk
                        blayer(nB)         = Trim$(CStr(ent.Layer))
                        bstatus(nB)        = statusL1
                        bNumero(nB)        = vNum
                        bExistente(nB)     = vExt
                        bProjetado(nB)     = ""
                        bEstai(nB)         = vEst
                        bOcupantes(nB)     = vOcu
                        bCoordZ(nB)        = vCoz
                        bX(nB)             = px
                        bY(nB)             = py
                        bNomeBaseExist(nB) = ExtrairNomeBasePosteBloco(vExt)
                        bNomeBaseProj(nB)  = ""

                        ' Linha 2: estrutura PROJETADA
                        nB = nB + 1
                        If nB > cap Then
                            cap = cap * 2
                            ReDim Preserve bnome(1 To cap)
                            ReDim Preserve blayer(1 To cap)
                            ReDim Preserve bstatus(1 To cap)
                            ReDim Preserve bNumero(1 To cap)
                            ReDim Preserve bExistente(1 To cap)
                            ReDim Preserve bProjetado(1 To cap)
                            ReDim Preserve bEstai(1 To cap)
                            ReDim Preserve bOcupantes(1 To cap)
                            ReDim Preserve bCoordZ(1 To cap)
                            ReDim Preserve bX(1 To cap)
                            ReDim Preserve bY(1 To cap)
                            ReDim Preserve bNomeBaseExist(1 To cap)
                            ReDim Preserve bNomeBaseProj(1 To cap)
                        End If
                        bnome(nB)          = nomeBlk
                        blayer(nB)         = Trim$(CStr(ent.Layer))
                        bstatus(nB)        = statusL2
                        bNumero(nB)        = vNum
                        bExistente(nB)     = ""
                        bProjetado(nB)     = vPrj
                        bEstai(nB)         = vEst
                        bOcupantes(nB)     = vOcu
                        bCoordZ(nB)        = vCoz
                        bX(nB)             = px
                        bY(nB)             = py
                        bNomeBaseExist(nB) = ""
                        bNomeBaseProj(nB)  = ExtrairNomeBasePosteBloco(vPrj)
                    Else
                        ' Demais blocos: 1 linha. Status do bloco tem prioridade.
                        bnome(nB)        = nomeBlk
                        blayer(nB)       = Trim$(CStr(ent.Layer))
                        ' RDARA120: cabo existente -> sempre EXISTENTES
                        If BlocoCasa(nomeU, "RDARA120") Then
                            bstatus(nB)  = "MATERIAIS EXISTENTES"
                        ' Regra do "#": se QUALQUER atributo comeca com # -> desinstalado
                        ElseIf temHashPoste Then
                            bstatus(nB)  = "MATERIAIS DESINSTALADOS"
                        ElseIf Len(sb) > 0 Then
                            bstatus(nB)  = sb
                        Else
                            bstatus(nB)  = StatusPorLayer(blayer(nB))
                        End If
                        bNumero(nB)      = vNum
                        bExistente(nB)   = vExt
                        bProjetado(nB)   = vPrj
                        bEstai(nB)       = vEst
                        bOcupantes(nB)   = vOcu
                        bCoordZ(nB)      = vCoz
                        bX(nB)           = px
                        bY(nB)           = py
                        bNomeBaseExist(nB) = ExtrairNomeBasePosteBloco(vExt)
                        bNomeBaseProj(nB)  = ExtrairNomeBasePosteBloco(vPrj)
                    End If
ContinuaBlk:
                End If
            Next ent
        End If
    Next sp
End Sub

' Extrai um nome base "limpo" do valor de atributo de bloco.
' Os valores podem ter prefixos como "lmd-tel#(M11-N1-S0...)" ou
' "D121000-CE4-S023-2SI-BC". Nesse caso retornamos o texto sem complementos.
' Para o padrao "Dxxxxxx-CExx-Sxxx-xxx", devolve o "Dxxxxxx".
' Para "M11-N1-..." devolve "M11".
' Para padroes comuns de poste (C12/600, DT11/300), usa o algoritmo padrao.
Private Function ExtrairNomeBasePosteBloco(ByVal txt As String) As String
    Dim s As String
    s = UCase$(Trim$(txt))
    If Len(s) = 0 Then
        ExtrairNomeBasePosteBloco = ""
        Exit Function
    End If

    ' Remove parenteses e prefixos comuns
    Dim idx As Long
    ' Se tiver "(" pega o que esta dentro
    idx = InStr(s, "(")
    If idx > 0 Then
        Dim fim As Long
        fim = InStr(idx + 1, s, ")")
        If fim > idx Then
            s = Mid$(s, idx + 1, fim - idx - 1)
        Else
            s = Mid$(s, idx + 1)
        End If
    End If

    ' Se tem prefixo tipo "lmd-tel#", "imd#", remove ate o #
    idx = InStr(s, "#")
    If idx > 0 Then s = Mid$(s, idx + 1)

    s = Trim$(s)

    ' Padrao D<6 digitos>-... -> retorna D<6 digitos>
    If Left$(s, 1) = "D" And Len(s) >= 7 Then
        Dim i As Long, ok As Boolean
        ok = True
        For i = 2 To 7
            If Mid$(s, i, 1) < "0" Or Mid$(s, i, 1) > "9" Then
                ok = False
                Exit For
            End If
        Next i
        If ok Then
            ExtrairNomeBasePosteBloco = Left$(s, 7)
            Exit Function
        End If
    End If

    ' Fallback: usa o algoritmo padrao (C12/600, M11, DT11/300, etc.)
    ExtrairNomeBasePosteBloco = ExtrairNomeBasePoste(s)
End Function

' =============================================================================
'  ABA "Postes (Blocos)" - listagem dos blocos com atributos
' =============================================================================
Private Sub CriarAbaBlocos(ByVal wb As Object, _
                            ByRef bnome() As String, _
                            ByRef blayer() As String, _
                            ByRef bstatus() As String, _
                            ByRef bNumero() As String, _
                            ByRef bExistente() As String, _
                            ByRef bProjetado() As String, _
                            ByRef bEstai() As String, _
                            ByRef bOcupantes() As String, _
                            ByRef bCoordZ() As String, _
                            ByRef bX() As Double, _
                            ByRef bY() As Double, _
                            ByRef bNomeBaseExist() As String, _
                            ByRef bNomeBaseProj() As String, _
                            ByVal nB As Long)
    Dim ws As Object
    Set ws = wb.Worksheets.Add(After:=wb.Worksheets(wb.Worksheets.Count))
    ws.Name = "Postes (Blocos)"

    ws.Cells(1, 1).Value = "POSTES E BLOCOS COM ATRIBUTOS"
    With ws.Range(ws.Cells(1, 1), ws.Cells(1, 13))
        .Merge
        .Font.Bold = True
        .Font.Size = 14
        .HorizontalAlignment = -4108
        .Interior.Color = RGB(31, 78, 120)
        .Font.Color = RGB(255, 255, 255)
    End With
    ws.Cells(2, 1).Value = "Total de blocos lidos: " & nB
    ws.Cells(2, 1).Font.Italic = True
    ws.Cells(3, 1).Value = "Regra: RDARA1100 = poste (gera 2 linhas: Existente=DESINSTALADO, Projetado=INSTALADO)"
    ws.Cells(3, 1).Font.Italic = True
    ws.Cells(3, 1).Font.Color = RGB(120, 120, 120)

    Dim hdrs As Variant
    hdrs = Array("Bloco", "Layer", "Status", "Numero", _
                 "Estr. Existente", "Nome Base (Exist)", _
                 "Estr. Projetada", "Nome Base (Proj)", _
                 "Estai", "Ocupantes", "Coord. Z", "X", "Y")
    Dim c As Long
    For c = 0 To UBound(hdrs)
        ws.Cells(4, c + 1).Value = hdrs(c)
    Next c
    With ws.Range(ws.Cells(4, 1), ws.Cells(4, 13))
        .Font.Bold = True
        .Interior.Color = RGB(220, 230, 241)
        .Borders.LineStyle = 1
    End With

    Dim r As Long, i As Long, linhasExibidas As Long
    r = 5
    linhasExibidas = 0
    For i = 1 To nB
        ' FILTRO: pula se ambos vazios ou ambos preenchidos (padrão "Exist: | Proj:")
        If Not (Len(bExistente(i)) > 0 Xor Len(bProjetado(i)) > 0) Then
            GoTo ContinuaBloco
        End If

        ws.Cells(r, 1).Value  = bnome(i)
        ws.Cells(r, 2).Value  = blayer(i)
        ws.Cells(r, 3).Value  = bstatus(i)
        ws.Cells(r, 4).Value  = bNumero(i)
        ws.Cells(r, 5).Value  = bExistente(i)
        ws.Cells(r, 6).Value  = bNomeBaseExist(i)
        ws.Cells(r, 7).Value  = bProjetado(i)
        ws.Cells(r, 8).Value  = bNomeBaseProj(i)
        ws.Cells(r, 9).Value  = bEstai(i)
        ws.Cells(r, 10).Value = bOcupantes(i)
        ws.Cells(r, 11).Value = bCoordZ(i)
        ws.Cells(r, 12).Value = bX(i)
        ws.Cells(r, 13).Value = bY(i)

        ' Pinta o status na coluna C
        Select Case bstatus(i)
            Case "MATERIAIS INSTALADOS"
                ws.Cells(r, 3).Interior.Color = RGB(226, 239, 218)
            Case "MATERIAIS DESINSTALADOS"
                ws.Cells(r, 3).Interior.Color = RGB(252, 228, 214)
            Case "MATERIAIS EXISTENTES"
                ws.Cells(r, 3).Interior.Color = RGB(217, 226, 243)
        End Select
        r = r + 1
        linhasExibidas = linhasExibidas + 1
ContinuaBloco:
    Next i

    ' Atualiza total exibido
    ws.Cells(2, 1).Value = "Total de blocos lidos: " & nB & " | Total exibido: " & linhasExibidas & " (filtrado)"

    ws.Range("A4:M4").AutoFilter
    ws.Columns("A").ColumnWidth = 18
    ws.Columns("B").ColumnWidth = 22
    ws.Columns("C").ColumnWidth = 22
    ws.Columns("D").ColumnWidth = 10
    ws.Columns("E").ColumnWidth = 32
    ws.Columns("F").ColumnWidth = 16
    ws.Columns("G").ColumnWidth = 32
    ws.Columns("H").ColumnWidth = 16
    ws.Columns("I").ColumnWidth = 16
    ws.Columns("J").ColumnWidth = 14
    ws.Columns("K").ColumnWidth = 14
    ws.Columns("L").ColumnWidth = 14
    ws.Columns("M").ColumnWidth = 14
End Sub

' =============================================================================
'  LEITURA DE BLOCOS DE CABO COM ATRIBUTOS (v3.2)
'  -----------------------------------------------------------------------------
'  Le blocos do tipo RDARA1110 (cabos) e similares, extraindo:
'    TCABO         -> cabo (tipo / especificacao, ex: BT 3#70(70)CAmm²)
'    DISTANCIA     -> distancia entre postes (numero)
'    =DISTANC...   -> distancia calculada / texto (ex: 22.0m)
'    AM_AI_FA      -> amarracoes AI fase
'    AM_AI_NE      -> amarracoes AI neutro
'    DIST_OB       -> distancia obrigatoria
'  Heuristica de aceite: bloco com atributo TCABO, ou nome contendo CABO,
'  ou RDARA1110.
' =============================================================================
Private Sub LerBlocosCabo(ByRef cNome() As String, _
                           ByRef cLayer() As String, _
                           ByRef cStatus() As String, _
                           ByRef cCabo() As String, _
                           ByRef cFamiliaCabo() As String, _
                           ByRef cDistancia() As String, _
                           ByRef cDistCalc() As String, _
                           ByRef cMetros() As Double, _
                           ByRef cAmFase() As String, _
                           ByRef cAmNeutro() As String, _
                           ByRef cDistObr() As String, _
                           ByRef cX() As Double, _
                           ByRef cY() As Double, _
                           ByRef nC As Long)
    Dim cap As Long
    cap = 256
    ReDim cNome(1 To cap)
    ReDim cLayer(1 To cap)
    ReDim cStatus(1 To cap)
    ReDim cCabo(1 To cap)
    ReDim cFamiliaCabo(1 To cap)
    ReDim cDistancia(1 To cap)
    ReDim cDistCalc(1 To cap)
    ReDim cMetros(1 To cap)
    ReDim cAmFase(1 To cap)
    ReDim cAmNeutro(1 To cap)
    ReDim cDistObr(1 To cap)
    ReDim cX(1 To cap)
    ReDim cY(1 To cap)
    nC = 0

    Dim sp As Object, ent As Object
    For Each sp In ThisDrawing.Blocks
        If EhEspacoParaLer(sp) Then
            For Each ent In sp
                Dim tipo As String
                tipo = ent.ObjectName
                If InStr(tipo, "BlockReference") > 0 Then
                    Dim nomeBlk As String, nomeU As String
                    nomeBlk = ""
                    On Error Resume Next
                    nomeBlk = ent.Name
                    If Err.Number <> 0 Then Err.Clear: nomeBlk = ent.EffectiveName
                    On Error GoTo 0
                    If Len(nomeBlk) = 0 Then GoTo ContinuaCabo
                    nomeU = UCase$(nomeBlk)
                    If Left$(nomeU, 1) = "*" Then GoTo ContinuaCabo

                    Dim temAtributo As Boolean
                    temAtributo = False
                    On Error Resume Next
                    temAtributo = ent.HasAttributes
                    On Error GoTo 0
                    If Not temAtributo Then GoTo ContinuaCabo

                    Dim atrs As Variant
                    On Error Resume Next
                    atrs = ent.GetAttributes
                    If Err.Number <> 0 Then Err.Clear: GoTo ContinuaCabo
                    On Error GoTo 0

                    Dim vCabo As String, vDist As String, vDistC As String
                    Dim vAmFa As String, vAmNe As String, vDistOb As String
                    vCabo = "" : vDist = "" : vDistC = ""
                    vAmFa = "" : vAmNe = "" : vDistOb = ""
                    Dim temTCabo As Boolean
                    temTCabo = False

                    Dim i As Long, tg As String, vl As String
                    Dim temHashCabo As Boolean
                    temHashCabo = False
                    For i = LBound(atrs) To UBound(atrs)
                        On Error Resume Next
                        tg = UCase$(Trim$(CStr(atrs(i).TagString)))
                        vl = Trim$(CStr(atrs(i).TextString))
                        On Error GoTo 0
                        ' Detecta # no inicio de QUALQUER atributo
                        If ComecaComHashtag(vl) Then temHashCabo = True
                        Select Case True
                            Case tg = "TCABO" Or InStr(tg, "TCABO") > 0 Or _
                                 (InStr(tg, "CABO") > 0 And InStr(tg, "DIST") = 0)
                                vCabo = vl
                                temTCabo = True
                            Case tg = "DISTANCIA"
                                vDist = vl
                            Case InStr(tg, "=DISTAN") > 0 Or _
                                 (InStr(tg, "DISTAN") > 0 And InStr(tg, "OB") = 0 _
                                  And tg <> "DISTANCIA")
                                vDistC = vl
                            Case InStr(tg, "AM_AI_FA") > 0 Or _
                                 (InStr(tg, "AM") > 0 And InStr(tg, "FA") > 0)
                                vAmFa = vl
                            Case InStr(tg, "AM_AI_NE") > 0 Or _
                                 (InStr(tg, "AM") > 0 And InStr(tg, "NE") > 0)
                                vAmNe = vl
                            Case InStr(tg, "DIST_OB") > 0 Or _
                                 (InStr(tg, "DIST") > 0 And InStr(tg, "OB") > 0)
                                vDistOb = vl
                        End Select
                    Next i

                    ' Heuristica de aceite (e um cabo?)
                    Dim aceita As Boolean
                    aceita = False
                    If EhBlocoPoste(nomeBlk) Then GoTo ContinuaCabo
                    If temTCabo Then aceita = True
                    ' RDARA1110 / RDARA1111: so aceita se TCABO tiver valor
                    If EhBlocoCabo(nomeBlk) And Not temTCabo Then GoTo ContinuaCabo
                    If EhBlocoCabo(nomeBlk) And temTCabo Then aceita = True
                    If Not aceita Then GoTo ContinuaCabo

                    nC = nC + 1
                    If nC > cap Then
                        cap = cap * 2
                        ReDim Preserve cNome(1 To cap)
                        ReDim Preserve cLayer(1 To cap)
                        ReDim Preserve cStatus(1 To cap)
                        ReDim Preserve cCabo(1 To cap)
                        ReDim Preserve cFamiliaCabo(1 To cap)
                        ReDim Preserve cDistancia(1 To cap)
                        ReDim Preserve cDistCalc(1 To cap)
                        ReDim Preserve cMetros(1 To cap)
                        ReDim Preserve cAmFase(1 To cap)
                        ReDim Preserve cAmNeutro(1 To cap)
                        ReDim Preserve cDistObr(1 To cap)
                        ReDim Preserve cX(1 To cap)
                        ReDim Preserve cY(1 To cap)
                    End If

                    Dim insP As Variant
                    On Error Resume Next
                    insP = ent.InsertionPoint
                    On Error GoTo 0

                    cNome(nC)        = nomeBlk
                    cLayer(nC)       = Trim$(CStr(ent.Layer))
                    ' Regra do "#": cabo com qualquer atributo iniciando com # = desinstalado
                    If temHashCabo Then
                        cStatus(nC) = "MATERIAIS DESINSTALADOS"
                    Else
                        cStatus(nC) = StatusFinalBloco(nomeBlk, cLayer(nC))
                    End If
                    cCabo(nC)        = vCabo
                    cFamiliaCabo(nC) = ClassificarCabo(vCabo)
                    cDistancia(nC)   = vDist
                    cDistCalc(nC)    = vDistC
                    cMetros(nC)      = ExtrairMetrosTexto(vDistC)
                    If cMetros(nC) = 0 Then cMetros(nC) = ValorNumerico(vDist)
                    cAmFase(nC)      = vAmFa
                    cAmNeutro(nC)    = vAmNe
                    cDistObr(nC)     = vDistOb
                    On Error Resume Next
                    cX(nC) = CDbl(insP(0))
                    cY(nC) = CDbl(insP(1))
                    On Error GoTo 0
ContinuaCabo:
                End If
            Next ent
        End If
    Next sp
End Sub

' Classifica o cabo em MT/BT a partir do texto do atributo TCABO.
' Ex: "BT 3#70(70)CAmm²" -> "COND BT" ; "MT 3#1/0(1/0)CA" -> "COND MT"
Private Function ClassificarCabo(ByVal txt As String) As String
    Dim s As String
    s = UCase$(Trim$(txt))
    If Len(s) = 0 Then
        ClassificarCabo = "-"
    ElseIf Left$(s, 2) = "BT" Or InStr(s, " BT ") > 0 Then
        ClassificarCabo = "COND BT"
    ElseIf Left$(s, 2) = "MT" Or InStr(s, " MT ") > 0 Then
        ClassificarCabo = "COND MT"
    Else
        ClassificarCabo = "COND"
    End If
End Function

' Extrai metros de um texto livre como "22.0m" ou "22,0 m". Aceita . ou , decimal.
Private Function ExtrairMetrosTexto(ByVal txt As String) As Double
    Dim s As String, i As Long, ch As String, num As String
    s = Trim$(txt)
    num = ""
    For i = 1 To Len(s)
        ch = Mid$(s, i, 1)
        If ch >= "0" And ch <= "9" Then
            num = num & ch
        ElseIf ch = "." Or ch = "," Then
            num = num & "."
        ElseIf (ch = "m" Or ch = "M") And Len(num) > 0 Then
            Exit For
        ElseIf Len(num) > 0 Then
            Exit For
        End If
    Next i
    If Len(num) > 0 And IsNumeric(num) Then
        ExtrairMetrosTexto = CDbl(num)
    Else
        ExtrairMetrosTexto = 0
    End If
End Function

' Converte string numerica (com , ou .) em Double. Retorna 0 se invalido.
Private Function ValorNumerico(ByVal txt As String) As Double
    Dim s As String
    s = Replace(Trim$(txt), ",", ".")
    If IsNumeric(s) Then
        ValorNumerico = CDbl(s)
    Else
        ValorNumerico = 0
    End If
End Function

' =============================================================================
'  LEITURA GENERICA DE BLOCOS DE OUTROS MATERIAIS (v3.4)
'  -----------------------------------------------------------------------------
'  Captura TODOS os blocos com atributos que NAO sao poste nem cabo:
'  TRAFO, CH FUSIVEL, CH FACA, PARA RAIO, RELIGADOR, REGULADOR, MUFLA, etc.
'  Classifica a familia (FamiliaDeBloco) e o status (nome do bloco > layer),
'  com a regra do "#" sobrescrevendo para DESINSTALADO.
'  Junta todos os textos dos atributos em oDesc para exibicao.
' =============================================================================
Private Sub LerBlocosOutros(ByRef oNome() As String, ByRef oLayer() As String, _
                             ByRef oStatus() As String, ByRef oFamilia() As String, _
                             ByRef oDesc() As String, ByRef oX() As Double, _
                             ByRef oY() As Double, ByRef nO As Long)
    Dim cap As Long
    cap = 256
    ReDim oNome(1 To cap)
    ReDim oLayer(1 To cap)
    ReDim oStatus(1 To cap)
    ReDim oFamilia(1 To cap)
    ReDim oDesc(1 To cap)
    ReDim oX(1 To cap)
    ReDim oY(1 To cap)
    nO = 0

    Dim sp As Object, ent As Object
    For Each sp In ThisDrawing.Blocks
        If EhEspacoParaLer(sp) Then
            For Each ent In sp
                Dim tipo As String
                tipo = ent.ObjectName
                If InStr(tipo, "BlockReference") > 0 Then
                    Dim nomeBlk As String, nomeU As String
                    nomeBlk = ""
                    On Error Resume Next
                    nomeBlk = ent.Name
                    If Err.Number <> 0 Then Err.Clear: nomeBlk = ent.EffectiveName
                    On Error GoTo 0
                    If Len(nomeBlk) = 0 Then GoTo ContinuaOutro
                    nomeU = UCase$(nomeBlk)
                    If Left$(nomeU, 1) = "*" Then GoTo ContinuaOutro

                    ' Pula postes e cabos (ja tratados em outras leituras)
                    If EhBlocoPoste(nomeBlk) Then GoTo ContinuaOutro
                    If EhBlocoCabo(nomeBlk) Then GoTo ContinuaOutro
                    ' Pula o bloco de dados do Piaui (ignorado por opcao do usuario)
                    If InStr(nomeU, "ESPECIFICA") > 0 Then GoTo ContinuaOutro
                    ' Pula blocos-simbolo Piaui (tratados em LerBlocosPiaui)
                    Dim fPi As String, sPi As String
                    If MapaPiaui(nomeBlk, fPi, sPi) Then GoTo ContinuaOutro

                    Dim temAtributo As Boolean
                    temAtributo = False
                    On Error Resume Next
                    temAtributo = ent.HasAttributes
                    On Error GoTo 0
                    If Not temAtributo Then GoTo ContinuaOutro

                    Dim atrs As Variant
                    On Error Resume Next
                    atrs = ent.GetAttributes
                    If Err.Number <> 0 Then Err.Clear: GoTo ContinuaOutro
                    On Error GoTo 0

                    ' Coleta atributos e detecta "#"
                    Dim descAll As String, temHash As Boolean
                    descAll = ""
                    temHash = False
                    Dim i As Long, tg As String, vl As String
                    ' Variaveis especificas para RDARA1011 (TRAFO)
                    Dim vPot As String, vLig As String, vVmt As String
                    vPot = "" : vLig = "" : vVmt = ""
                    Dim ehRdara1011 As Boolean
                    ehRdara1011 = BlocoCasa(nomeU, "RDARA1011")
                    ' Variaveis especificas para RDARA1023 (CHAVE FACA/FUSIVEL)
                    Dim vTipo As String, vVn As String, vAn As String
                    Dim vA0n As String, vNbi As String, vQtd As String
                    vTipo = "": vVn = "": vAn = "": vA0n = "": vNbi = "": vQtd = ""
                    Dim ehRdara1023 As Boolean
                    ehRdara1023 = BlocoCasa(nomeU, "RDARA1023")

                    For i = LBound(atrs) To UBound(atrs)
                        On Error Resume Next
                        tg = UCase$(Trim$(CStr(atrs(i).TagString)))
                        vl = Trim$(CStr(atrs(i).TextString))
                        On Error GoTo 0
                        If ComecaComHashtag(vl) Then temHash = True
                        If ehRdara1011 Then
                            ' Captura apenas POT, LIG e V_MT
                            Select Case True
                                Case tg = "POT" Or InStr(tg, "POT") > 0
                                    vPot = vl
                                Case tg = "LIG" Or InStr(tg, "LIGAC") > 0
                                    vLig = vl
                                Case tg = "V_MT" Or tg = "VMT" Or _
                                     (InStr(tg, "V_MT") > 0) Or _
                                     (InStr(tg, "CLASSE") > 0 And InStr(tg, "TENS") > 0)
                                    vVmt = vl
                            End Select
                        ElseIf ehRdara1023 Then
                            ' Captura TIPO, V_N, A_N, A0_N, NBI e Q (quantidade)
                            Select Case True
                                Case tg = "TIPO" Or InStr(tg, "TIPO") > 0
                                    vTipo = vl
                                Case tg = "V_N" Or tg = "VN" Or _
                                     (InStr(tg, "CLASSE") > 0 And InStr(tg, "TENS") > 0)
                                    vVn = vl
                                Case tg = "A_N"
                                    vAn = vl
                                Case tg = "A0_N"
                                    vA0n = vl
                                Case tg = "NBI" Or InStr(tg, "ISOLAMENTO") > 0
                                    vNbi = vl
                                Case tg = "Q" Or InStr(tg, "QUANT") > 0
                                    vQtd = vl
                            End Select
                        Else
                            If Len(vl) > 0 Then
                                If Len(descAll) > 0 Then descAll = descAll & " | "
                                descAll = descAll & tg & "=" & vl
                            End If
                        End If
                    Next i

                    ' Monta descricao final
                    If ehRdara1011 Then
                        ' Formato: "10 KVA FN 25 KV"
                        Dim partes1011 As String
                        partes1011 = ""
                        If Len(vPot) > 0 Then partes1011 = vPot & " KVA"
                        If Len(vLig) > 0 Then
                            If Len(partes1011) > 0 Then partes1011 = partes1011 & " "
                            partes1011 = partes1011 & vLig
                        End If
                        If Len(vVmt) > 0 Then
                            If Len(partes1011) > 0 Then partes1011 = partes1011 & " "
                            partes1011 = partes1011 & vVmt & " KV"
                        End If
                        descAll = partes1011
                    End If

                    ' Monta descricao do RDARA1023: spec + quantidade
                    If ehRdara1023 Then
                        Dim spec1023 As String
                        spec1023 = ""
                        If Len(vVn) > 0 Then spec1023 = vVn
                        If Len(vAn) > 0 Then
                            If Len(spec1023) > 0 Then spec1023 = spec1023 & " "
                            spec1023 = spec1023 & vAn
                        End If
                        If Len(vA0n) > 0 Then
                            If Len(spec1023) > 0 Then spec1023 = spec1023 & " "
                            spec1023 = spec1023 & vA0n
                        End If
                        If Len(vNbi) > 0 Then
                            If Len(spec1023) > 0 Then spec1023 = spec1023 & " "
                            spec1023 = spec1023 & vNbi
                        End If
                        descAll = spec1023
                        If Len(vQtd) > 0 Then
                            If Len(descAll) > 0 Then descAll = descAll & "  |  "
                            descAll = descAll & "Qtd: " & vQtd
                        End If
                        If Len(descAll) = 0 Then descAll = "CH FACA"
                    End If

                    ' So registra se tiver algum atributo com conteudo
                    If Len(descAll) = 0 Then GoTo ContinuaOutro

                    nO = nO + 1
                    If nO > cap Then
                        cap = cap * 2
                        ReDim Preserve oNome(1 To cap)
                        ReDim Preserve oLayer(1 To cap)
                        ReDim Preserve oStatus(1 To cap)
                        ReDim Preserve oFamilia(1 To cap)
                        ReDim Preserve oDesc(1 To cap)
                        ReDim Preserve oX(1 To cap)
                        ReDim Preserve oY(1 To cap)
                    End If

                    Dim insP As Variant
                    On Error Resume Next
                    insP = ent.InsertionPoint
                    On Error GoTo 0

                    oNome(nO)    = nomeBlk
                    oLayer(nO)   = Trim$(CStr(ent.Layer))
                    ' Status: regra do "#" tem prioridade maxima
                    If temHash Then
                        oStatus(nO) = "MATERIAIS DESINSTALADOS"
                    Else
                        oStatus(nO) = StatusFinalBloco(nomeBlk, oLayer(nO))
                    End If
                    oFamilia(nO) = FamiliaDeBloco(nomeBlk, descAll)
                    ' RDARA1023: classifica como CH FACA (ou CH FUS se TIPO=FUSIVEL)
                    If ehRdara1023 Then
                        If InStr(UCase$(vTipo), "FUS") > 0 Then
                            oFamilia(nO) = "CH FUS"
                        Else
                            oFamilia(nO) = "CH FACA"
                        End If
                        ' Status padrao do RDARA1023 = INSTALADO (a menos que tenha "#")
                        If Not temHash Then oStatus(nO) = "MATERIAIS INSTALADOS"
                    End If
                    oDesc(nO)    = descAll
                    On Error Resume Next
                    oX(nO) = CDbl(insP(0))
                    oY(nO) = CDbl(insP(1))
                    On Error GoTo 0
ContinuaOutro:
                End If
            Next ent
        End If
    Next sp
End Sub

' =============================================================================
'  PADRAO PIAUI (PLPT) — blocos-simbolo SEM atributos, classificados por NOME.
'  Mapa definido pelo usuario:
'    PP            -> POSTE  / INSTALADO
'    EP, PE, PEXIS -> POSTE  / EXISTENTE
'    CB_AT*, CB_BT*-> CABO   / INSTALADO   (desc: "MT ..." / "BT ...")
'    chavep        -> CHAVE  / INSTALADO
'    CHFE          -> CHAVE  / EXISTENTE
'    STRAFOE, T7-E -> TRAFO  / EXISTENTE
'  (Piaui_especificacao_postes e demais blocos sao IGNORADOS.)
'  Coexiste com o padrao RS: nomes RS (RDARA*) nao casam aqui.
' =============================================================================
Private Function MapaPiaui(ByVal nome As String, ByRef fam As String, _
                            ByRef stat As String) As Boolean
    Dim u As String
    u = UCase$(Trim$(nome))
    fam = ""
    stat = ""
    Select Case u
        Case "PP"
            fam = "POSTE": stat = "MATERIAIS INSTALADOS"
        Case "EP", "PE", "PEXIS"
            fam = "POSTE": stat = "MATERIAIS EXISTENTES"
        Case "CHAVEP"
            fam = "CHAVE": stat = "MATERIAIS INSTALADOS"
        Case "CHFE"
            fam = "CHAVE": stat = "MATERIAIS EXISTENTES"
        Case "STRAFOE", "T7-E"
            fam = "TRAFO": stat = "MATERIAIS EXISTENTES"
        Case Else
            If Left$(u, 5) = "CB_AT" Or Left$(u, 5) = "CB_BT" Then
                fam = "CABO": stat = "MATERIAIS INSTALADOS"
            End If
    End Select
    MapaPiaui = (Len(fam) > 0)
End Function

' Descricao amigavel para os blocos Piaui (cabos ganham prefixo MT/BT).
Private Function DescPiaui(ByVal nome As String) As String
    Dim u As String
    u = UCase$(Trim$(nome))
    If Left$(u, 5) = "CB_AT" Then
        DescPiaui = "MT " & Trim$(Mid$(nome, 6))
    ElseIf Left$(u, 5) = "CB_BT" Then
        DescPiaui = "BT " & Trim$(Mid$(nome, 6))
    Else
        DescPiaui = nome
    End If
End Function

' Le os blocos-simbolo do padrao Piaui (sem atributos) por NOME.
Private Sub LerBlocosPiaui(ByRef pNome() As String, ByRef pFam() As String, _
        ByRef pStat() As String, ByRef pDesc() As String, _
        ByRef pX() As Double, ByRef pY() As Double, ByRef nP As Long)
    Dim cap As Long
    cap = 256
    ReDim pNome(1 To cap)
    ReDim pFam(1 To cap)
    ReDim pStat(1 To cap)
    ReDim pDesc(1 To cap)
    ReDim pX(1 To cap)
    ReDim pY(1 To cap)
    nP = 0

    ' --- Pre-passo: coleta os blocos "Piaui_especificacao_postes" com a
    '     posicao (X,Y) e a etiqueta 4 (Altura/Esforco), para casar com PP.
    Dim sX() As Double, sY() As Double, sAlt() As String, nS As Long
    Dim scap As Long
    scap = 256
    ReDim sX(1 To scap)
    ReDim sY(1 To scap)
    ReDim sAlt(1 To scap)
    nS = 0
    Dim sp2 As Object, ent2 As Object
    For Each sp2 In ThisDrawing.Blocks
        If EhEspacoParaLer(sp2) Then
            For Each ent2 In sp2
                If InStr(ent2.ObjectName, "BlockReference") > 0 Then
                    Dim nm2 As String
                    nm2 = ""
                    On Error Resume Next
                    nm2 = ent2.Name
                    If Err.Number <> 0 Then Err.Clear: nm2 = ent2.EffectiveName
                    On Error GoTo 0
                    If InStr(UCase$(nm2), "ESPECIFICA") > 0 Then
                        Dim hasA As Boolean, at2 As Variant, altv As String, q As Long
                        hasA = False
                        altv = ""
                        On Error Resume Next
                        hasA = ent2.HasAttributes
                        If hasA Then at2 = ent2.GetAttributes
                        On Error GoTo 0
                        If hasA Then
                            For q = LBound(at2) To UBound(at2)
                                On Error Resume Next
                                If Trim$(CStr(at2(q).TagString)) = "4" Then _
                                    altv = Trim$(CStr(at2(q).TextString))
                                On Error GoTo 0
                            Next q
                        End If
                        Dim ip2 As Variant
                        On Error Resume Next
                        ip2 = ent2.InsertionPoint
                        On Error GoTo 0
                        nS = nS + 1
                        If nS > scap Then
                            scap = scap * 2
                            ReDim Preserve sX(1 To scap)
                            ReDim Preserve sY(1 To scap)
                            ReDim Preserve sAlt(1 To scap)
                        End If
                        On Error Resume Next
                        sX(nS) = CDbl(ip2(0))
                        sY(nS) = CDbl(ip2(1))
                        On Error GoTo 0
                        sAlt(nS) = altv
                    End If
                End If
            Next ent2
        End If
    Next sp2

    Dim sp As Object, ent As Object
    For Each sp In ThisDrawing.Blocks
        If EhEspacoParaLer(sp) Then
            For Each ent In sp
                If InStr(ent.ObjectName, "BlockReference") > 0 Then
                    Dim nomeBlk As String
                    nomeBlk = ""
                    On Error Resume Next
                    nomeBlk = ent.Name
                    If Err.Number <> 0 Then Err.Clear: nomeBlk = ent.EffectiveName
                    On Error GoTo 0
                    If Len(nomeBlk) = 0 Then GoTo ProxPiaui
                    If Left$(nomeBlk, 1) = "*" Then GoTo ProxPiaui

                    Dim famP As String, statP As String
                    If Not MapaPiaui(nomeBlk, famP, statP) Then GoTo ProxPiaui

                    nP = nP + 1
                    If nP > cap Then
                        cap = cap * 2
                        ReDim Preserve pNome(1 To cap)
                        ReDim Preserve pFam(1 To cap)
                        ReDim Preserve pStat(1 To cap)
                        ReDim Preserve pDesc(1 To cap)
                        ReDim Preserve pX(1 To cap)
                        ReDim Preserve pY(1 To cap)
                    End If

                    Dim insP As Variant
                    On Error Resume Next
                    insP = ent.InsertionPoint
                    On Error GoTo 0

                    pNome(nP) = nomeBlk
                    pFam(nP)  = famP
                    pStat(nP) = statP
                    pDesc(nP) = DescPiaui(nomeBlk)
                    On Error Resume Next
                    pX(nP) = CDbl(insP(0))
                    pY(nP) = CDbl(insP(1))
                    On Error GoTo 0

                    ' PP: anexa Altura/Esforco do "especificacao_postes" mais proximo
                    If UCase$(nomeBlk) = "PP" And nS > 0 Then
                        Dim bestI As Long, bestD As Double, dd As Double, qq As Long
                        bestI = 0
                        bestD = 0
                        For qq = 1 To nS
                            dd = (sX(qq) - pX(nP)) * (sX(qq) - pX(nP)) + _
                                 (sY(qq) - pY(nP)) * (sY(qq) - pY(nP))
                            If bestI = 0 Or dd < bestD Then
                                bestD = dd
                                bestI = qq
                            End If
                        Next qq
                        If bestI > 0 And Len(sAlt(bestI)) > 0 Then
                            pDesc(nP) = "Alt/Esf: " & sAlt(bestI)
                        End If
                    End If
                End If
ProxPiaui:
            Next ent
        End If
    Next sp
End Sub

' =============================================================================
'  ABA "Cabos (Blocos)" - listagem dos blocos de cabo com atributos
' =============================================================================
Private Sub CriarAbaCabos(ByVal wb As Object, _
                           ByRef cNome() As String, _
                           ByRef cLayer() As String, _
                           ByRef cStatus() As String, _
                           ByRef cCabo() As String, _
                           ByRef cFamiliaCabo() As String, _
                           ByRef cDistancia() As String, _
                           ByRef cDistCalc() As String, _
                           ByRef cMetros() As Double, _
                           ByRef cAmFase() As String, _
                           ByRef cAmNeutro() As String, _
                           ByRef cDistObr() As String, _
                           ByRef cX() As Double, _
                           ByRef cY() As Double, _
                           ByVal nC As Long)
    Dim ws As Object
    Set ws = wb.Worksheets.Add(After:=wb.Worksheets(wb.Worksheets.Count))
    ws.Name = "Cabos (Blocos)"

    ws.Cells(1, 1).Value = "CABOS (BLOCOS COM ATRIBUTOS)"
    With ws.Range(ws.Cells(1, 1), ws.Cells(1, 13))
        .Merge
        .Font.Bold = True
        .Font.Size = 14
        .HorizontalAlignment = -4108
        .Interior.Color = RGB(84, 130, 53)
        .Font.Color = RGB(255, 255, 255)
    End With

    ' Total de metros por status (resumo no topo)
    Dim totM As Double, i As Long
    totM = 0
    For i = 1 To nC
        totM = totM + cMetros(i)
    Next i
    ws.Cells(2, 1).Value = "Total de blocos de cabo: " & nC & _
                           "   |   Metragem total: " & Format$(totM, "0.0") & " m"
    ws.Cells(2, 1).Font.Italic = True
    ws.Cells(3, 1).Value = "Regra: RDARA1110 = INSTALADO  |  RDARA1111 = DESINSTALADO"
    ws.Cells(3, 1).Font.Italic = True
    ws.Cells(3, 1).Font.Color = RGB(120, 120, 120)

    Dim hdrs As Variant
    hdrs = Array("Bloco", "Layer", "Status", "Cabo (TCABO)", _
                 "Distancia (desenho)", "Familia", _
                 "Distancia (ent. postes)", "Metros", _
                 "Amarr. Fase", "Amarr. Neutro", "Dist. Obrig.", "X", "Y")
    Dim c As Long
    For c = 0 To UBound(hdrs)
        ws.Cells(4, c + 1).Value = hdrs(c)
    Next c
    With ws.Range(ws.Cells(4, 1), ws.Cells(4, 13))
        .Font.Bold = True
        .Interior.Color = RGB(226, 239, 218)
        .Borders.LineStyle = 1
    End With
    ' Destaca a coluna "Distancia (desenho)" (col E)
    With ws.Cells(4, 5)
        .Interior.Color = RGB(255, 230, 153)
        .Font.Color = RGB(0, 0, 0)
    End With

    Dim r As Long
    r = 5
    For i = 1 To nC
        ' Distancia exatamente como aparece no desenho.
        ' Preferimos o texto literal de =DISTANC (ex: "22.0m"); se vier vazio,
        ' montamos a partir dos metros calculados.
        Dim distDesenho As String
        distDesenho = Trim$(cDistCalc(i))
        If Len(distDesenho) = 0 Then
            If cMetros(i) > 0 Then
                distDesenho = Format$(cMetros(i), "0.0") & "m"
            ElseIf Len(Trim$(cDistancia(i))) > 0 Then
                distDesenho = Trim$(cDistancia(i)) & "m"
            End If
        End If

        ws.Cells(r, 1).Value  = cNome(i)
        ws.Cells(r, 2).Value  = cLayer(i)
        ws.Cells(r, 3).Value  = cStatus(i)
        ws.Cells(r, 4).Value  = cCabo(i)
        ws.Cells(r, 5).Value  = distDesenho           ' <-- Distancia (desenho)
        ws.Cells(r, 6).Value  = cFamiliaCabo(i)
        ws.Cells(r, 7).Value  = cDistancia(i)
        ws.Cells(r, 8).Value  = cMetros(i)
        ws.Cells(r, 9).Value  = cAmFase(i)
        ws.Cells(r, 10).Value = cAmNeutro(i)
        ws.Cells(r, 11).Value = cDistObr(i)
        ws.Cells(r, 12).Value = cX(i)
        ws.Cells(r, 13).Value = cY(i)

        ' Destaque visual da distancia (col E) em amarelo claro
        ws.Cells(r, 5).Interior.Color = RGB(255, 247, 220)
        ws.Cells(r, 5).Font.Bold = True

        Select Case cStatus(i)
            Case "MATERIAIS INSTALADOS"
                ws.Cells(r, 3).Interior.Color = RGB(226, 239, 218)
            Case "MATERIAIS DESINSTALADOS"
                ws.Cells(r, 3).Interior.Color = RGB(252, 228, 214)
            Case "MATERIAIS EXISTENTES"
                ws.Cells(r, 3).Interior.Color = RGB(217, 226, 243)
        End Select
        r = r + 1
    Next i

    ' Subtotais por familia de cabo
    r = r + 1
    ws.Cells(r, 1).Value = "RESUMO POR FAMILIA + STATUS"
    With ws.Range(ws.Cells(r, 1), ws.Cells(r, 4))
        .Merge
        .Font.Bold = True
        .Interior.Color = RGB(84, 130, 53)
        .Font.Color = RGB(255, 255, 255)
    End With
    r = r + 1
    ws.Cells(r, 1).Value = "Familia"
    ws.Cells(r, 2).Value = "Status"
    ws.Cells(r, 3).Value = "Qtd Trechos"
    ws.Cells(r, 4).Value = "Metros"
    With ws.Range(ws.Cells(r, 1), ws.Cells(r, 4))
        .Font.Bold = True
        .Interior.Color = RGB(226, 239, 218)
    End With
    r = r + 1

    Dim agg As Object, aggM As Object
    Set agg = CreateObject("Scripting.Dictionary")
    Set aggM = CreateObject("Scripting.Dictionary")
    Dim key As String
    For i = 1 To nC
        key = cFamiliaCabo(i) & "||" & cStatus(i)
        If agg.Exists(key) Then
            agg(key) = agg(key) + 1
            aggM(key) = aggM(key) + cMetros(i)
        Else
            agg.Add key, 1
            aggM.Add key, cMetros(i)
        End If
    Next i
    Dim keysArr As Variant, kk As Variant, partes() As String
    keysArr = agg.Keys
    Call OrdenarStringsAsc(keysArr)
    For Each kk In keysArr
        partes = Split(CStr(kk), "||")
        ws.Cells(r, 1).Value = partes(0)
        ws.Cells(r, 2).Value = partes(1)
        ws.Cells(r, 3).Value = agg(kk)
        ws.Cells(r, 4).Value = aggM(kk)
        r = r + 1
    Next kk

    ws.Range("A4:M4").AutoFilter
    ws.Columns("A").ColumnWidth = 16   ' Bloco
    ws.Columns("B").ColumnWidth = 20   ' Layer
    ws.Columns("C").ColumnWidth = 22   ' Status
    ws.Columns("D").ColumnWidth = 24   ' Cabo (TCABO)
    ws.Columns("E").ColumnWidth = 16   ' Distancia (desenho)  <- destaque
    ws.Columns("F").ColumnWidth = 12   ' Familia
    ws.Columns("G").ColumnWidth = 16   ' Distancia (ent. postes)
    ws.Columns("H").ColumnWidth = 10   ' Metros
    ws.Columns("I").ColumnWidth = 14   ' Amarr. Fase
    ws.Columns("J").ColumnWidth = 14   ' Amarr. Neutro
    ws.Columns("K").ColumnWidth = 14   ' Dist. Obrig.
    ws.Columns("L").ColumnWidth = 12   ' X
    ws.Columns("M").ColumnWidth = 12   ' Y
End Sub

' =============================================================================
'  ABA UNIFICADA "Blocos" - postes E cabos juntos (v3.3)
'  -----------------------------------------------------------------------------
'  Recebe os arrays ja lidos de postes e cabos e escreve uma unica aba com
'  colunas genericas que servem para os dois tipos.
' =============================================================================
Private Sub CriarAbaBlocosUnificada(ByVal wb As Object, _
        ByRef bnome() As String, ByRef blayer() As String, ByRef bstatus() As String, _
        ByRef bNumero() As String, ByRef bExistente() As String, _
        ByRef bProjetado() As String, ByRef bEstai() As String, _
        ByRef bOcupantes() As String, ByRef bCoordZ() As String, _
        ByRef bX() As Double, ByRef bY() As Double, _
        ByRef bNomeBaseExist() As String, ByRef bNomeBaseProj() As String, _
        ByVal nB As Long, _
        ByRef cNome() As String, ByRef cLayer() As String, ByRef cStatus() As String, _
        ByRef cCabo() As String, ByRef cFamiliaCabo() As String, _
        ByRef cDistancia() As String, ByRef cDistCalc() As String, _
        ByRef cMetros() As Double, ByRef cAmFase() As String, _
        ByRef cAmNeutro() As String, ByRef cDistObr() As String, _
        ByRef cX() As Double, ByRef cY() As Double, ByVal nC As Long)

    Dim ws As Object
    Set ws = wb.Worksheets.Add(After:=wb.Worksheets(wb.Worksheets.Count))
    ws.Name = "Blocos"

    ws.Cells(1, 1).Value = "BLOCOS (POSTES + CABOS)"
    With ws.Range(ws.Cells(1, 1), ws.Cells(1, 14))
        .Merge
        .Font.Bold = True
        .Font.Size = 14
        .HorizontalAlignment = -4108
        .Interior.Color = RGB(31, 78, 120)
        .Font.Color = RGB(255, 255, 255)
    End With
    ws.Cells(2, 1).Value = "Postes: " & nB & "   |   Cabos: " & nC & _
                           "   |   Total de linhas: " & (nB + nC) & " (filtrado)"
    ws.Cells(2, 1).Font.Italic = True
    ws.Cells(3, 1).Value = "Regras: RDARA034/RDARA1100 = 2 linhas (Exist=DESINST / Proj=INST)" & _
                           "  |  RDARA1110/RDARA121 = INST  |  RDARA1111/RDARA120 = DESINST" & _
                           "  |  RDARA164 = EXISTENTE"
    ws.Cells(3, 1).Font.Italic = True
    ws.Cells(3, 1).Font.Color = RGB(120, 120, 120)

    Dim hdrs As Variant
    hdrs = Array("Tipo", "Bloco", "Layer", "Status", "Numero", _
                 "Descricao (Estr./Cabo)", "Nome Base / Familia", _
                 "Distancia (desenho)", "Metros", _
                 "Estai", "Ocupantes", "Coord. Z", "X", "Y")
    Dim c As Long
    For c = 0 To UBound(hdrs)
        ws.Cells(4, c + 1).Value = hdrs(c)
    Next c
    With ws.Range(ws.Cells(4, 1), ws.Cells(4, 14))
        .Font.Bold = True
        .Interior.Color = RGB(220, 230, 241)
        .Borders.LineStyle = 1
    End With

    Dim r As Long, i As Long, linhasPostesExibidas As Long
    r = 5
    linhasPostesExibidas = 0

    ' --- Postes ------------------------------------------------------------
    For i = 1 To nB
        Dim descP As String, nbP As String
        If Len(bProjetado(i)) > 0 And Len(bExistente(i)) = 0 Then
            descP = bProjetado(i)
            nbP = bNomeBaseProj(i)
        ElseIf Len(bExistente(i)) > 0 And Len(bProjetado(i)) = 0 Then
            descP = bExistente(i)
            nbP = bNomeBaseExist(i)
        Else
            ' FILTRO: pula se ambos vazios (gera "Exist:  | Proj:") ou ambos preenchidos
            GoTo ContinuaPoste
            descP = "Exist: " & bExistente(i) & " | Proj: " & bProjetado(i)
            If Len(bNomeBaseProj(i)) > 0 Then
                nbP = bNomeBaseProj(i)
            Else
                nbP = bNomeBaseExist(i)
            End If
        End If

        ws.Cells(r, 1).Value  = "POSTE"
        ws.Cells(r, 2).Value  = bnome(i)
        ws.Cells(r, 3).Value  = blayer(i)
        ws.Cells(r, 4).Value  = bstatus(i)
        ws.Cells(r, 5).Value  = bNumero(i)
        ws.Cells(r, 6).Value  = descP
        ws.Cells(r, 7).Value  = nbP
        ws.Cells(r, 8).Value  = ""        ' distancia (so cabo)
        ws.Cells(r, 9).Value  = ""        ' metros (so cabo)
        ws.Cells(r, 10).Value = bEstai(i)
        ws.Cells(r, 11).Value = bOcupantes(i)
        ws.Cells(r, 12).Value = bCoordZ(i)
        ws.Cells(r, 13).Value = bX(i)
        ws.Cells(r, 14).Value = bY(i)
        Call PintaStatusCelula(ws.Cells(r, 4), bstatus(i))
        r = r + 1
        linhasPostesExibidas = linhasPostesExibidas + 1
ContinuaPoste:
    Next i

    ' --- Cabos -------------------------------------------------------------
    For i = 1 To nC
        Dim distDesenho As String
        distDesenho = Trim$(cDistCalc(i))
        If Len(distDesenho) = 0 Then
            If cMetros(i) > 0 Then
                distDesenho = Format$(cMetros(i), "0.0") & "m"
            ElseIf Len(Trim$(cDistancia(i))) > 0 Then
                distDesenho = Trim$(cDistancia(i)) & "m"
            End If
        End If

        ws.Cells(r, 1).Value  = "CABO"
        ws.Cells(r, 2).Value  = cNome(i)
        ws.Cells(r, 3).Value  = cLayer(i)
        ws.Cells(r, 4).Value  = cStatus(i)
        ws.Cells(r, 5).Value  = ""        ' numero (so poste)
        ws.Cells(r, 6).Value  = cCabo(i)
        ws.Cells(r, 7).Value  = cFamiliaCabo(i)
        ws.Cells(r, 8).Value  = distDesenho
        ws.Cells(r, 9).Value  = cMetros(i)
        ws.Cells(r, 10).Value = ""
        ws.Cells(r, 11).Value = ""
        ws.Cells(r, 12).Value = ""
        ws.Cells(r, 13).Value = cX(i)
        ws.Cells(r, 14).Value = cY(i)
        Call PintaStatusCelula(ws.Cells(r, 4), cStatus(i))
        ws.Cells(r, 8).Interior.Color = RGB(255, 247, 220)
        ws.Cells(r, 8).Font.Bold = True
        r = r + 1
    Next i

    ws.Range("A4:N4").AutoFilter
    ws.Columns("A").ColumnWidth = 8
    ws.Columns("B").ColumnWidth = 14
    ws.Columns("C").ColumnWidth = 20
    ws.Columns("D").ColumnWidth = 24
    ws.Columns("E").ColumnWidth = 10
    ws.Columns("F").ColumnWidth = 38
    ws.Columns("G").ColumnWidth = 18
    ws.Columns("H").ColumnWidth = 16
    ws.Columns("I").ColumnWidth = 10
    ws.Columns("J").ColumnWidth = 14
    ws.Columns("K").ColumnWidth = 14
    ws.Columns("L").ColumnWidth = 12
    ws.Columns("M").ColumnWidth = 12
    ws.Columns("N").ColumnWidth = 12
End Sub

' Pinta uma celula conforme o status do material.
Private Sub PintaStatusCelula(ByVal cel As Object, ByVal status As String)
    Select Case status
        Case "MATERIAIS INSTALADOS"
            cel.Interior.Color = RGB(226, 239, 218)
        Case "MATERIAIS DESINSTALADOS"
            cel.Interior.Color = RGB(252, 228, 214)
        Case "MATERIAIS EXISTENTES"
            cel.Interior.Color = RGB(217, 226, 243)
    End Select
End Sub

' =============================================================================
'  ABA "Blocos" ORGANIZADA POR FAMILIA (v3.4)
'  -----------------------------------------------------------------------------
'  Recebe os arrays unificados (postes + cabos + outros) e escreve uma unica
'  aba "Blocos", agrupando os registros em SECOES por familia/tipo
'  (POSTE, CABO, TRAFO, CH FUSIVEL, PARA RAIO, RELIGADOR, REGULADOR, ...).
' =============================================================================
Private Sub CriarAbaBlocosPorFamilia(ByVal wb As Object, _
        ByRef uTipo() As String, ByRef uFam() As String, ByRef uBloco() As String, _
        ByRef uStat() As String, ByRef uNum() As String, ByRef uDesc() As String, _
        ByRef uBase() As String, ByRef uDist() As String, ByRef uMet() As Double, _
        ByRef uX() As Double, ByRef uY() As Double, ByVal nU As Long, _
        ByVal nB As Long, ByVal nC As Long, ByVal nO As Long)

    Dim ws As Object
    Set ws = wb.Worksheets.Add(After:=wb.Worksheets(wb.Worksheets.Count))
    ws.Name = "Blocos"

    ' Formata colunas de texto (A:G) como TEXTO para evitar erro 1004:
    ' valores iniciados por '=', '+', '-' ou '@' fazem o Excel tentar
    ' interpretar como formula. Colunas H (Metros) e I (X) ficam numericas.
    ws.Columns("A:G").NumberFormat = "@"

    ws.Cells(1, 1).Value = "BLOCOS POR FAMILIA"
    With ws.Range(ws.Cells(1, 1), ws.Cells(1, 9))
        .Merge
        .Font.Bold = True
        .Font.Size = 14
        .HorizontalAlignment = -4108
        .Interior.Color = RGB(31, 78, 120)
        .Font.Color = RGB(255, 255, 255)
    End With
    ws.Cells(2, 1).Value = "Postes: " & nB & "  |  Cabos: " & nC & _
                           "  |  Outros materiais: " & nO & _
                           "  |  Total: " & (nB + nC + nO)
    ws.Cells(2, 1).Font.Italic = True
    ws.Cells(3, 1).Value = "Regra '#': qualquer descricao iniciada com # conta como DESINSTALADO."
    ws.Cells(3, 1).Font.Italic = True
    ws.Cells(3, 1).Font.Color = RGB(120, 120, 120)

    ' Coleta a lista de familias distintas, na ordem de prioridade desejada
    Dim ordem As Variant
    ordem = Array("POSTE", "ESTRUTURA", "CABO", "TRAFO", "CH FUSIVEL", "CH FACA", _
                  "CHAVE", "PARA RAIO", "RELIGADOR", "REGULADOR", "MUFLA", _
                  "ATERRAMENTO", "ATERRAMENTO DE CERCA", "CORDOALHA", _
                  "MEDICAO", "CAPACITOR", "RAMAL", "OUTRO")

    Dim r As Long
    r = 5
    Dim oi As Long, i As Long
    Dim familiasUsadas As Object
    Set familiasUsadas = CreateObject("Scripting.Dictionary")

    ' Primeiro escreve na ordem definida; depois qualquer familia nao listada.
    For oi = 0 To UBound(ordem)
        r = EscreverSecaoFamilia(ws, r, CStr(ordem(oi)), uFam, uTipo, uBloco, _
                                 uStat, uNum, uDesc, uBase, uDist, uMet, uX, uY, nU)
        familiasUsadas(CStr(ordem(oi))) = True
    Next oi

    ' Familias que apareceram mas nao estao na lista de ordem
    Dim extras As Object
    Set extras = CreateObject("Scripting.Dictionary")
    For i = 1 To nU
        If Not familiasUsadas.Exists(uFam(i)) Then
            If Not extras.Exists(uFam(i)) Then extras.Add uFam(i), True
        End If
    Next i
    Dim kx As Variant
    For Each kx In extras.Keys
        r = EscreverSecaoFamilia(ws, r, CStr(kx), uFam, uTipo, uBloco, _
                                 uStat, uNum, uDesc, uBase, uDist, uMet, uX, uY, nU)
    Next kx

    ws.Columns("A").ColumnWidth = 16
    ws.Columns("B").ColumnWidth = 14
    ws.Columns("C").ColumnWidth = 24
    ws.Columns("D").ColumnWidth = 10
    ws.Columns("E").ColumnWidth = 42
    ws.Columns("F").ColumnWidth = 16
    ws.Columns("G").ColumnWidth = 14
    ws.Columns("H").ColumnWidth = 12
    ws.Columns("I").ColumnWidth = 12
End Sub

' Escreve uma secao para uma familia especifica. Retorna a proxima linha livre.
' Se a familia nao tiver registros, nao escreve nada.
Private Function EscreverSecaoFamilia(ByVal ws As Object, ByVal startRow As Long, _
        ByVal familia As String, ByRef uFam() As String, ByRef uTipo() As String, _
        ByRef uBloco() As String, ByRef uStat() As String, ByRef uNum() As String, _
        ByRef uDesc() As String, ByRef uBase() As String, ByRef uDist() As String, _
        ByRef uMet() As Double, ByRef uX() As Double, ByRef uY() As Double, _
        ByVal nU As Long) As Long
    ' Conta quantos registros tem essa familia
    Dim cnt As Long, i As Long
    cnt = 0
    For i = 1 To nU
        If uFam(i) = familia Then cnt = cnt + 1
    Next i
    If cnt = 0 Then
        EscreverSecaoFamilia = startRow
        Exit Function
    End If

    Dim r As Long
    r = startRow

    ' Titulo da secao
    ws.Cells(r, 1).Value = familia & "  (" & cnt & ")"
    With ws.Range(ws.Cells(r, 1), ws.Cells(r, 9))
        .Merge
        .Font.Bold = True
        .Interior.Color = RGB(68, 114, 196)
        .Font.Color = RGB(255, 255, 255)
    End With
    r = r + 1

    ' Cabecalho
    ws.Cells(r, 1).Value = "Tipo/Familia"
    ws.Cells(r, 2).Value = "Bloco"
    ws.Cells(r, 3).Value = "Status"
    ws.Cells(r, 4).Value = "Numero"
    ws.Cells(r, 5).Value = "Descricao"
    ws.Cells(r, 6).Value = "Nome Base/Spec"
    ws.Cells(r, 7).Value = "Distancia"
    ws.Cells(r, 8).Value = "Metros"
    ws.Cells(r, 9).Value = "X"
    With ws.Range(ws.Cells(r, 1), ws.Cells(r, 9))
        .Font.Bold = True
        .Interior.Color = RGB(220, 230, 241)
        .Borders.LineStyle = 1
    End With
    r = r + 1

    For i = 1 To nU
        If uFam(i) = familia Then
            ws.Cells(r, 1).Value = uFam(i)
            ws.Cells(r, 2).Value = uBloco(i)
            ws.Cells(r, 3).Value = uStat(i)
            ws.Cells(r, 4).Value = uNum(i)
            ws.Cells(r, 5).Value = uDesc(i)
            ws.Cells(r, 6).Value = uBase(i)
            ws.Cells(r, 7).Value = uDist(i)
            If uMet(i) > 0 Then ws.Cells(r, 8).Value = uMet(i)
            ws.Cells(r, 9).Value = uX(i)
            Call PintaStatusCelula(ws.Cells(r, 3), uStat(i))
            r = r + 1
        End If
    Next i

    r = r + 1   ' linha em branco entre secoes
    EscreverSecaoFamilia = r
End Function

' =============================================================================
'  BARRA VISUAL EM TEXTO (blocos cheios) — proporcional a valor/maximo
' =============================================================================
Private Function BarraTexto(ByVal valor As Long, ByVal maxv As Long) As String
    Dim ln As Long, j As Long, s As String
    If maxv <= 0 Or valor <= 0 Then
        BarraTexto = ""
        Exit Function
    End If
    ln = CLng((valor / maxv) * 18)
    If ln < 1 Then ln = 1
    For j = 1 To ln
        s = s & ChrW(9608)   ' caractere "bloco cheio"
    Next j
    BarraTexto = s
End Function

' =============================================================================
'  ABA "PAINEL" — DASHBOARD DE ANALISE RAPIDA (v3.4)
'  -----------------------------------------------------------------------------
'  Consolida numa unica tela os numeros que voce mais consulta:
'    1. TOTAIS GERAIS (textos, postes, cabos, outros)
'    2. MATERIAIS POR STATUS (instalados / desinstalados / existentes) com
'       contagem de textos + blocos, percentual e barra visual
'    3. Tabela cruzada FAMILIA x STATUS dos blocos (o que entrou / o que saiu)
'  Fica como a PRIMEIRA aba, abrindo direto na visao executiva.
' =============================================================================
Private Sub CriarAbaPainel(ByVal wb As Object, _
        ByRef uFam() As String, ByRef uStat() As String, ByVal nU As Long, _
        ByVal nB As Long, ByVal nC As Long, ByVal nO As Long, _
        ByRef arrStatus() As String, ByVal n As Long)

    ' Painel e OPCIONAL: qualquer falha aqui nunca deve abortar a exportacao.
    On Error GoTo PainelErro

    Const C_INST As String = "MATERIAIS INSTALADOS"
    Const C_DESI As String = "MATERIAIS DESINSTALADOS"
    Const C_EXIS As String = "MATERIAIS EXISTENTES"

    Dim ws As Object
    Set ws = wb.Worksheets.Add(Before:=wb.Worksheets(1))
    ws.Name = "PAINEL"

    ' --- Contagens por status: TEXTOS ---
    Dim tTxtI As Long, tTxtD As Long, tTxtE As Long, tTxtO As Long
    Dim i As Long
    For i = 1 To n
        Select Case arrStatus(i)
            Case C_INST: tTxtI = tTxtI + 1
            Case C_DESI: tTxtD = tTxtD + 1
            Case C_EXIS: tTxtE = tTxtE + 1
            Case Else:   tTxtO = tTxtO + 1
        End Select
    Next i

    ' --- Contagens por status: BLOCOS ---
    Dim tBlkI As Long, tBlkD As Long, tBlkE As Long, tBlkO As Long
    For i = 1 To nU
        Select Case uStat(i)
            Case C_INST: tBlkI = tBlkI + 1
            Case C_DESI: tBlkD = tBlkD + 1
            Case C_EXIS: tBlkE = tBlkE + 1
            Case Else:   tBlkO = tBlkO + 1
        End Select
    Next i

    ' Combinados (textos + blocos)
    Dim cI As Long, cD As Long, cE As Long, cO As Long, grand As Long
    cI = tTxtI + tBlkI: cD = tTxtD + tBlkD
    cE = tTxtE + tBlkE: cO = tTxtO + tBlkO
    grand = n + nU
    If grand < 1 Then grand = 1

    Dim r As Long

    ' ===== TITULO =====================================================
    ws.Cells(1, 1).Value = "PAINEL DE ANALISE"
    With ws.Range("A1:F1")
        .Merge
        .Font.Bold = True
        .Font.Size = 18
        .HorizontalAlignment = -4108
        .VerticalAlignment = -4108
        .Interior.Color = RGB(31, 78, 120)
        .Font.Color = RGB(255, 255, 255)
    End With
    ws.Rows(1).RowHeight = 32
    ws.Cells(2, 1).Value = "ZWCAD - Exportar Textos v3.4    |    Gerado em " & _
                           Format$(Now, "dd/mm/yyyy hh:nn")
    With ws.Range("A2:F2")
        .Merge
        .Font.Italic = True
        .Font.Color = RGB(110, 110, 110)
        .HorizontalAlignment = -4108
    End With

    ' ===== SECAO 1: TOTAIS GERAIS =====================================
    r = 4
    ws.Cells(r, 1).Value = "1. TOTAIS GERAIS"
    With ws.Range(ws.Cells(r, 1), ws.Cells(r, 6))
        .Merge
        .Font.Bold = True
        .Font.Size = 12
        .Interior.Color = RGB(47, 84, 150)
        .Font.Color = RGB(255, 255, 255)
    End With
    r = r + 1

    Dim baseTot As Long
    baseTot = r
    ws.Cells(r, 1).Value = "Textos classificados":            ws.Cells(r, 2).Value = n:        r = r + 1
    ws.Cells(r, 1).Value = "Blocos de poste":                 ws.Cells(r, 2).Value = nB:       r = r + 1
    ws.Cells(r, 1).Value = "Blocos de cabo":                  ws.Cells(r, 2).Value = nC:       r = r + 1
    ws.Cells(r, 1).Value = "Outros materiais (trafo, chave...)": ws.Cells(r, 2).Value = nO:    r = r + 1
    ws.Cells(r, 1).Value = "TOTAL de blocos":                 ws.Cells(r, 2).Value = nU
    ws.Range(ws.Cells(r, 1), ws.Cells(r, 2)).Font.Bold = True:                                 r = r + 1
    ws.Cells(r, 1).Value = "TOTAL geral (textos + blocos)":   ws.Cells(r, 2).Value = grand
    ws.Range(ws.Cells(r, 1), ws.Cells(r, 2)).Font.Bold = True
    With ws.Range(ws.Cells(baseTot, 1), ws.Cells(r, 2))
        .Borders.LineStyle = 1
        .Borders.Color = RGB(200, 200, 200)
    End With
    ws.Range(ws.Cells(baseTot, 2), ws.Cells(r, 2)).Font.Size = 12
    r = r + 2

    ' ===== SECAO 2: MATERIAIS POR STATUS ==============================
    ws.Cells(r, 1).Value = "2. MATERIAIS POR STATUS"
    With ws.Range(ws.Cells(r, 1), ws.Cells(r, 6))
        .Merge
        .Font.Bold = True
        .Font.Size = 12
        .Interior.Color = RGB(47, 84, 150)
        .Font.Color = RGB(255, 255, 255)
    End With
    r = r + 1

    ' Cabecalho
    ws.Cells(r, 1).Value = "Status"
    ws.Cells(r, 2).Value = "Textos"
    ws.Cells(r, 3).Value = "Blocos"
    ws.Cells(r, 4).Value = "Total"
    ws.Cells(r, 5).Value = "%"
    ws.Cells(r, 6).Value = "Distribuicao"
    With ws.Range(ws.Cells(r, 1), ws.Cells(r, 6))
        .Font.Bold = True
        .Interior.Color = RGB(220, 230, 241)
        .Borders.LineStyle = 1
    End With
    r = r + 1

    Dim maxTot As Long
    maxTot = cI
    If cD > maxTot Then maxTot = cD
    If cE > maxTot Then maxTot = cE
    If cO > maxTot Then maxTot = cO

    Dim linhaStatus As Long
    linhaStatus = r
    ' INSTALADOS
    ws.Cells(r, 1).Value = "INSTALADOS": ws.Cells(r, 2).Value = tTxtI
    ws.Cells(r, 3).Value = tBlkI: ws.Cells(r, 4).Value = cI
    ws.Cells(r, 5).Value = Format$(cI / grand, "0.0%")
    ws.Cells(r, 6).Value = BarraTexto(cI, maxTot)
    Call PintaStatusCelula(ws.Cells(r, 1), C_INST)
    ws.Cells(r, 6).Font.Color = RGB(0, 130, 0): r = r + 1
    ' DESINSTALADOS
    ws.Cells(r, 1).Value = "DESINSTALADOS": ws.Cells(r, 2).Value = tTxtD
    ws.Cells(r, 3).Value = tBlkD: ws.Cells(r, 4).Value = cD
    ws.Cells(r, 5).Value = Format$(cD / grand, "0.0%")
    ws.Cells(r, 6).Value = BarraTexto(cD, maxTot)
    Call PintaStatusCelula(ws.Cells(r, 1), C_DESI)
    ws.Cells(r, 6).Font.Color = RGB(190, 0, 0): r = r + 1
    ' EXISTENTES
    ws.Cells(r, 1).Value = "EXISTENTES": ws.Cells(r, 2).Value = tTxtE
    ws.Cells(r, 3).Value = tBlkE: ws.Cells(r, 4).Value = cE
    ws.Cells(r, 5).Value = Format$(cE / grand, "0.0%")
    ws.Cells(r, 6).Value = BarraTexto(cE, maxTot)
    Call PintaStatusCelula(ws.Cells(r, 1), C_EXIS)
    ws.Cells(r, 6).Font.Color = RGB(0, 70, 160): r = r + 1
    ' Outros / sem status
    ws.Cells(r, 1).Value = "Outros / sem status": ws.Cells(r, 2).Value = tTxtO
    ws.Cells(r, 3).Value = tBlkO: ws.Cells(r, 4).Value = cO
    ws.Cells(r, 5).Value = Format$(cO / grand, "0.0%")
    ws.Cells(r, 6).Value = BarraTexto(cO, maxTot)
    ws.Cells(r, 1).Interior.Color = RGB(235, 235, 235)
    ws.Cells(r, 6).Font.Color = RGB(120, 120, 120): r = r + 1
    ' TOTAL
    ws.Cells(r, 1).Value = "TOTAL": ws.Cells(r, 2).Value = n
    ws.Cells(r, 3).Value = nU: ws.Cells(r, 4).Value = grand
    ws.Cells(r, 5).Value = "100%"
    With ws.Range(ws.Cells(r, 1), ws.Cells(r, 6))
        .Font.Bold = True
        .Interior.Color = RGB(242, 242, 242)
    End With
    With ws.Range(ws.Cells(linhaStatus, 1), ws.Cells(r, 6))
        .Borders.LineStyle = 1
        .Borders.Color = RGB(200, 200, 200)
    End With
    r = r + 2

    ' ===== SECAO 3: BLOCOS POR FAMILIA x STATUS =======================
    ws.Cells(r, 1).Value = "3. BLOCOS POR FAMILIA x STATUS"
    With ws.Range(ws.Cells(r, 1), ws.Cells(r, 6))
        .Merge
        .Font.Bold = True
        .Font.Size = 12
        .Interior.Color = RGB(47, 84, 150)
        .Font.Color = RGB(255, 255, 255)
    End With
    r = r + 1

    ' Cabecalho
    ws.Cells(r, 1).Value = "Familia"
    ws.Cells(r, 2).Value = "Instalados"
    ws.Cells(r, 3).Value = "Desinstalados"
    ws.Cells(r, 4).Value = "Existentes"
    ws.Cells(r, 5).Value = "Outros"
    ws.Cells(r, 6).Value = "Total"
    With ws.Range(ws.Cells(r, 1), ws.Cells(r, 6))
        .Font.Bold = True
        .Interior.Color = RGB(220, 230, 241)
        .Borders.LineStyle = 1
    End With
    ws.Cells(r, 2).Interior.Color = RGB(226, 239, 218)
    ws.Cells(r, 3).Interior.Color = RGB(252, 228, 214)
    ws.Cells(r, 4).Interior.Color = RGB(217, 226, 243)
    r = r + 1

    ' Monta lista ordenada de familias (mesma ordem da aba Blocos)
    Dim ordem As Variant
    ordem = Array("POSTE", "ESTRUTURA", "CABO", "TRAFO", "CH FUSIVEL", "CH FACA", _
                  "CHAVE", "PARA RAIO", "RELIGADOR", "REGULADOR", "MUFLA", _
                  "ATERRAMENTO", "ATERRAMENTO DE CERCA", "CORDOALHA", _
                  "MEDICAO", "CAPACITOR", "RAMAL", "OUTRO")
    Dim fams As Object
    Set fams = CreateObject("Scripting.Dictionary")
    Dim oi As Long, ap As Boolean
    For oi = 0 To UBound(ordem)
        ap = False
        For i = 1 To nU
            If uFam(i) = CStr(ordem(oi)) Then ap = True: Exit For
        Next i
        If ap And Not fams.Exists(CStr(ordem(oi))) Then fams.Add CStr(ordem(oi)), True
    Next oi
    For i = 1 To nU
        If Len(uFam(i)) > 0 And Not fams.Exists(uFam(i)) Then fams.Add uFam(i), True
    Next i

    Dim linhaFam As Long
    linhaFam = r
    Dim somaI As Long, somaD As Long, somaE As Long, somaO As Long
    Dim k As Variant, fI As Long, fD As Long, fE As Long, fO As Long, fT As Long
    For Each k In fams.Keys
        fI = 0: fD = 0: fE = 0: fO = 0
        For i = 1 To nU
            If uFam(i) = CStr(k) Then
                Select Case uStat(i)
                    Case C_INST: fI = fI + 1
                    Case C_DESI: fD = fD + 1
                    Case C_EXIS: fE = fE + 1
                    Case Else:   fO = fO + 1
                End Select
            End If
        Next i
        fT = fI + fD + fE + fO
        ws.Cells(r, 1).Value = CStr(k)
        ws.Cells(r, 2).Value = fI
        ws.Cells(r, 3).Value = fD
        ws.Cells(r, 4).Value = fE
        ws.Cells(r, 5).Value = fO
        ws.Cells(r, 6).Value = fT
        ws.Cells(r, 6).Font.Bold = True
        If fI > 0 Then ws.Cells(r, 2).Interior.Color = RGB(226, 239, 218)
        If fD > 0 Then ws.Cells(r, 3).Interior.Color = RGB(252, 228, 214)
        If fE > 0 Then ws.Cells(r, 4).Interior.Color = RGB(217, 226, 243)
        somaI = somaI + fI: somaD = somaD + fD
        somaE = somaE + fE: somaO = somaO + fO
        r = r + 1
    Next k

    ' Linha TOTAL
    ws.Cells(r, 1).Value = "TOTAL"
    ws.Cells(r, 2).Value = somaI
    ws.Cells(r, 3).Value = somaD
    ws.Cells(r, 4).Value = somaE
    ws.Cells(r, 5).Value = somaO
    ws.Cells(r, 6).Value = somaI + somaD + somaE + somaO
    With ws.Range(ws.Cells(r, 1), ws.Cells(r, 6))
        .Font.Bold = True
        .Interior.Color = RGB(242, 242, 242)
    End With
    With ws.Range(ws.Cells(linhaFam, 1), ws.Cells(r, 6))
        .Borders.LineStyle = 1
        .Borders.Color = RGB(200, 200, 200)
    End With

    ' --- Larguras ---
    ws.Columns("A").ColumnWidth = 34
    ws.Columns("B").ColumnWidth = 14
    ws.Columns("C").ColumnWidth = 15
    ws.Columns("D").ColumnWidth = 13
    ws.Columns("E").ColumnWidth = 11
    ws.Columns("F").ColumnWidth = 24
    ws.Range("B:F").HorizontalAlignment = -4108  ' centraliza numeros

    Exit Sub

PainelErro:
    ' Falha ao montar o painel: ignora silenciosamente (aba e opcional).
    ' A exportacao continua normalmente com as demais abas.
End Sub

' =============================================================================
'  MACRO PRINCIPAL
' =============================================================================
Public Sub ExportarTextosParaExcel()
    On Error GoTo TratarErro

    Dim errNum As Long
    Dim errDesc As String
    Dim errSrc As String
    Dim estagio As String
    estagio = "inicio"

    ' --- Caminho do arquivo de saida ----------------------------------------
    Dim dwgName As String, baseName As String
    dwgName = ThisDrawing.Name
    If Len(dwgName) = 0 Then
        baseName = "Desenho"
    Else
        baseName = dwgName
        If InStrRev(baseName, ".") > 0 Then
            baseName = Left$(baseName, InStrRev(baseName, ".") - 1)
        End If
    End If

    Dim outPath As String, downloads As String
    downloads = Environ$("USERPROFILE") & "\Downloads"
    If Dir(downloads, vbDirectory) = "" Then
        On Error Resume Next
        MkDir downloads
        On Error GoTo TratarErro
    End If
    outPath = downloads & "\" & baseName & "_TEXTOS.xlsx"
    If Dir(outPath) <> "" Then
        outPath = downloads & "\" & baseName & "_TEXTOS_" & _
                  Format(Now, "yyyymmdd_hhnnss") & ".xlsx"
    End If

    ' --- Mapa layer -> cor ACI ----------------------------------------------
    Dim layerCor As Object
    Set layerCor = CreateObject("Scripting.Dictionary")
    Dim lay As Object
    Dim diagMsg As String, diagCount As Long
    diagMsg = "Diagnostico (primeiros layers lidos):" & vbCrLf
    diagCount = 0
    For Each lay In ThisDrawing.Layers
        Dim chave As String
        chave = LCase$(Trim$(lay.Name))
        layerCor(chave) = CorLayerSegura(lay)
        If DIAGNOSTICO_LAYERS And diagCount < 15 Then
            diagMsg = diagMsg & "  [" & lay.Name & "]  ACI=" & _
                      layerCor(chave) & vbCrLf
            diagCount = diagCount + 1
        End If
    Next lay
    If DIAGNOSTICO_LAYERS Then
        MsgBox diagMsg & vbCrLf & "Total de layers: " & layerCor.Count, _
               vbInformation, "Diagnostico"
    End If

    ' --- Arrays de dados ----------------------------------------------------
    Dim arrLayer()  As String
    Dim arrAci()    As Integer
    Dim arrCor()    As String
    Dim arrTexto()  As String
    Dim arrFam()    As String
    Dim arrStatus() As String
    Dim arrNomeBase() As String
    Dim arrScore()  As Integer
    Dim arrConfianca() As String
    Dim arrX()      As Double
    Dim arrY()      As Double
    Dim arrH()      As Double
    Dim arrCodEst() As String  ' Codigo estrutura extraido: Mid(texto,10,7)

    Dim cap As Long
    cap = 1024
    ReDim arrLayer(1 To cap)
    ReDim arrAci(1 To cap)
    ReDim arrCor(1 To cap)
    ReDim arrTexto(1 To cap)
    ReDim arrFam(1 To cap)
    ReDim arrStatus(1 To cap)
    ReDim arrNomeBase(1 To cap)
    ReDim arrScore(1 To cap)
    ReDim arrConfianca(1 To cap)
    ReDim arrX(1 To cap)
    ReDim arrY(1 To cap)
    ReDim arrH(1 To cap)
    ReDim arrCodEst(1 To cap)
    Dim n As Long
    n = 0

    ' --- Itera entidades do desenho -----------------------------------------
    estagio = "lendo entidades do desenho"
    Dim sp As Object
    For Each sp In ThisDrawing.Blocks
        If EhEspacoParaLer(sp) Then
            Dim ent As Object
            For Each ent In sp
                Dim tipo As String
                tipo = ent.ObjectName
                Dim ehTexto As Boolean, ehMText As Boolean
                ehTexto = (InStr(tipo, "DbText") > 0) And (InStr(tipo, "DbMText") = 0)
                ehMText = (InStr(tipo, "DbMText") > 0)
                If ehTexto Or ehMText Then
                    n = n + 1
                    If n > cap Then
                        cap = cap * 2
                        ReDim Preserve arrLayer(1 To cap)
                        ReDim Preserve arrAci(1 To cap)
                        ReDim Preserve arrCor(1 To cap)
                        ReDim Preserve arrTexto(1 To cap)
                        ReDim Preserve arrFam(1 To cap)
                        ReDim Preserve arrStatus(1 To cap)
                        ReDim Preserve arrNomeBase(1 To cap)
                        ReDim Preserve arrScore(1 To cap)
                        ReDim Preserve arrConfianca(1 To cap)
                        ReDim Preserve arrX(1 To cap)
                        ReDim Preserve arrY(1 To cap)
                        ReDim Preserve arrH(1 To cap)
                        ReDim Preserve arrCodEst(1 To cap)
                    End If

                    Dim lname As String, conteudo As String
                    Dim ins As Variant, alt As Double
                    lname = Trim$(CStr(ent.Layer))

                    If ehTexto Then
                        Dim t As Object
                        Set t = ent
                        conteudo = t.TextString
                        ins = t.InsertionPoint
                        alt = t.Height
                    Else
                        Dim mt As Object
                        Set mt = ent
                        conteudo = RemoverCodigosMText(mt.TextString)
                        ins = mt.InsertionPoint
                        alt = mt.Height
                    End If

                    Dim corEnt As Integer, corFinal As Integer
                    corEnt = CorEntidadeSegura(ent)
                    If corEnt = 256 Or corEnt = 0 Then
                        If layerCor.Exists(LCase$(lname)) Then
                            corFinal = CInt(layerCor(LCase$(lname)))
                        Else
                            corFinal = 7
                        End If
                    Else
                        corFinal = corEnt
                    End If

                    ' Regra explicita do layer RAMAIS_NO_MODEL:
                    ' Status=INSTALADOS + Familia=RAMAL (sobrescreve classificacao auto).
                    Dim lnameU As String
                    lnameU = UCase$(lname)
                    Dim ehRamalLayer As Boolean
                    ehRamalLayer = (InStr(lnameU, "RAMAIS_NO_MODEL") > 0 _
                                Or InStr(lnameU, "RAMAIS NO MODEL") > 0)

                    arrLayer(n)  = lname
                    arrAci(n)    = corFinal
                    arrCor(n)    = NomeCorACI(corFinal)
                    arrTexto(n)  = conteudo
                    arrX(n)      = ins(0)
                    arrY(n)      = ins(1)
                    arrH(n)      = alt

                    ' Classificacao com confianca
                    Dim famTmp As String, scoreTmp As Integer
                    If ehRamalLayer Then
                        famTmp = "RAMAL"
                        scoreTmp = 100  ' regra explicita do projeto
                    Else
                        Call ClassificarComConfianca(conteudo, lname, famTmp, scoreTmp)
                    End If

                    ' --- Regra CABO por COR (planilha RECLASSIFICAR) --------
                    ' Magenta (ACI 6) = CABO INSTALADO / familia COND PROT.
                    ' Branco/Preto (ACI 7) = CABO EXISTENTE.
                    ' So se aplica quando o texto tem padrao de metragem
                    ' (numero + sufixo "m", ex: "18m 3 #3X70(70)"); cabos sem
                    ' esse padrao NAO sao classificados como instalados so
                    ' pela cor.
                    Dim statusCorCabo As String
                    statusCorCabo = ""
                    If Not ehRamalLayer And ExtrairMetrosCabo(conteudo) > 0 Then
                        If corFinal = 6 Then
                            famTmp = "COND PROT"
                            scoreTmp = 90
                            statusCorCabo = "MATERIAIS INSTALADOS"
                        ElseIf corFinal = 7 Then
                            statusCorCabo = "MATERIAIS EXISTENTES"
                        End If
                    End If

                    ' Extrai codigo de estrutura: Mid(texto, 10, 7)
                    Dim codEst As String, nomeBaseEst As String
                    codEst = ""
                    If Len(conteudo) >= 10 Then
                        codEst = Trim$(Mid$(conteudo, 10, 7))
                    End If
                    ' Se extraido tiver padrao de POSTE -> classifica como POSTE
                    If Len(codEst) > 0 Then
                        nomeBaseEst = ExtrairNomeBasePoste(codEst)
                        If Len(nomeBaseEst) > 0 Then
                            If famTmp = "CLASSIFICAR" Or famTmp = "-" Or _
                               famTmp = "NAO CLASSIFICADO" Then
                                famTmp  = "POSTE"
                                scoreTmp = 85
                            End If
                        End If
                    End If

                    arrFam(n)       = famTmp
                    arrScore(n)     = scoreTmp
                    arrConfianca(n) = NivelConfianca(scoreTmp)
                    If Len(statusCorCabo) > 0 Then
                        arrStatus(n) = statusCorCabo
                    Else
                        arrStatus(n) = StatusPorLayer(lname)
                    End If
                    arrNomeBase(n)  = ExtrairNomeBasePoste(conteudo)
                    arrCodEst(n)    = codEst
                End If
            Next ent
        End If
    Next sp

    ' OBS: NAO aborta quando n = 0. Um desenho pode nao ter TEXT/MTEXT livres
    ' e mesmo assim conter BLOCOS com os dados (ex.: as-builts padrao Piaui,
    ' onde tudo vem em atributos/simbolos). As abas de blocos sao geradas
    ' normalmente; as secoes que dependem de texto sao puladas com 'If n > 0'.

    ' --- Cria planilha via Excel automation ---------------------------------
    estagio = "criando Excel + aba Textos"
    Dim xl As Object, wb As Object, ws As Object
    Set xl = CreateObject("Excel.Application")
    xl.Visible = False
    xl.DisplayAlerts = False
    Set wb = xl.Workbooks.Add
    Set ws = wb.Worksheets(1)
    ws.Name = "Textos"

    ' Cabecalho com coluna Status, Nome Base, Confianca e Score
    ws.Cells(1, 1).Value = "Layer"
    ws.Cells(1, 2).Value = "Status"
    ws.Cells(1, 3).Value = "Cor ACI"
    ws.Cells(1, 4).Value = "Nome da Cor"
    ws.Cells(1, 5).Value = "Conteudo do Texto"
    ws.Cells(1, 6).Value = "Familia"
    ws.Cells(1, 7).Value = "Nome Base (Poste)"
    ws.Cells(1, 8).Value = "Confianca"
    ws.Cells(1, 9).Value = "Score"
    ws.Cells(1, 10).Value = "X"
    ws.Cells(1, 11).Value = "Y"
    ws.Cells(1, 12).Value = "Altura Texto"
    ws.Cells(1, 13).Value = "Cod. Estrutura"   ' Mid(texto,10,7)

    ' Escrita em bloco (mais rapido) -- so se houver textos
    Dim dados() As Variant
    Dim i As Long
    If n > 0 Then
    ReDim dados(1 To n, 1 To 13)
    For i = 1 To n
        dados(i, 1)  = arrLayer(i)
        dados(i, 2)  = arrStatus(i)
        dados(i, 3)  = arrAci(i)
        dados(i, 4)  = arrCor(i)
        dados(i, 5)  = arrTexto(i)
        dados(i, 6)  = arrFam(i)
        dados(i, 7)  = arrNomeBase(i)
        dados(i, 8)  = arrConfianca(i)
        dados(i, 9)  = arrScore(i)
        dados(i, 10) = arrX(i)
        dados(i, 11) = arrY(i)
        dados(i, 12) = arrH(i)
        dados(i, 13) = arrCodEst(i)
    Next i
    estagio = "escrevendo aba Textos (bloco de dados)"
    ws.Range(ws.Cells(2, 1), ws.Cells(n + 1, 13)).Value = dados
    End If   ' n > 0

    With ws.Range("A1:M1")
        .Font.Bold = True
        .Interior.Color = RGB(220, 230, 241)
    End With
    ' Destaque visual coluna Cod. Estrutura
    With ws.Cells(1, 13)
        .Interior.Color = RGB(255, 230, 153)
        .Font.Bold = True
    End With
    ws.Range(ws.Cells(1, 1), ws.Cells(n + 1, 13)).Columns.AutoFit
    ws.Range("A1:M1").AutoFilter

    ' Formata condicional simples: pinta a celula Confianca por nivel
    Dim rng As Object, cel As Object
    If n > 0 Then
    Set rng = ws.Range(ws.Cells(2, 8), ws.Cells(n + 1, 8))
    For Each cel In rng
        Select Case cel.Value
            Case "Alta":  cel.Interior.Color = RGB(198, 239, 206)  ' verde
            Case "Media": cel.Interior.Color = RGB(255, 235, 156)  ' amarelo
            Case "Baixa": cel.Interior.Color = RGB(255, 199, 206)  ' vermelho
        End Select
    Next cel

    estagio = "ordenando aba Textos"
    With ws.Sort
        .SortFields.Clear
        .SortFields.Add Key:=ws.Range("B2:B" & (n + 1)), Order:=1
        .SortFields.Add Key:=ws.Range("C2:C" & (n + 1)), Order:=1
        .SortFields.Add Key:=ws.Range("F2:F" & (n + 1)), Order:=1
        .SortFields.Add Key:=ws.Range("A2:A" & (n + 1)), Order:=1
        .SetRange ws.Range("A1:L" & (n + 1))
        .Header = 1
        .Apply
    End With
    End If   ' n > 0

    ' =====================================================================
    '  ABA RESUMO
    ' =====================================================================
    estagio = "montando aba Resumo"
    Dim ws2 As Object
    Set ws2 = wb.Worksheets.Add(After:=ws)
    ws2.Name = "Resumo"

    Dim totFam    As Object  ' familia -> qtd
    Dim totStatus As Object  ' status  -> qtd
    Dim posteAlt  As Object  ' altKey  -> qtd
    Dim postesItem As Object ' "STATUS|LAYER|FAMILIA|MODELO_BASE|ALTURA" -> qtd
    Dim cabosItem  As Object ' "STATUS|LAYER|FAMILIA|SPEC"  -> metros
    Dim cabosQtd   As Object ' "STATUS|LAYER|FAMILIA|SPEC"  -> trechos
    Dim outroItem  As Object ' "STATUS|LAYER|FAMILIA|TEXTO" -> qtd

    Set totFam     = CreateObject("Scripting.Dictionary")
    Set totStatus  = CreateObject("Scripting.Dictionary")
    Set posteAlt   = CreateObject("Scripting.Dictionary")
    Set postesItem = CreateObject("Scripting.Dictionary")
    Set cabosItem  = CreateObject("Scripting.Dictionary")
    Set cabosQtd   = CreateObject("Scripting.Dictionary")
    Set outroItem  = CreateObject("Scripting.Dictionary")

    Dim fam As String, cont As String, key As String, stat As String
    Dim altPoste As Double, altKey As String
    Dim metros As Double, spec As String
    Dim nomeBase As String
    Dim partes() As String
    Dim totalPostes As Long
    Dim totalMetros As Double

    For i = 1 To n
        fam  = arrFam(i)
        cont = arrTexto(i)
        stat = arrStatus(i)

        ' Totais globais
        If totFam.Exists(fam) Then
            totFam(fam) = totFam(fam) + 1
        Else
            totFam.Add fam, 1
        End If
        If totStatus.Exists(stat) Then
            totStatus(stat) = totStatus(stat) + 1
        Else
            totStatus.Add stat, 1
        End If

        Select Case fam

            Case "POSTE CIRCULAR", "POSTE DT"
                nomeBase = ExtrairNomeBasePoste(cont)
                altPoste = ExtrairAlturaPoste(nomeBase)
                If altPoste > 0 Then
                    altKey = CStr(altPoste) & "m"
                Else
                    altKey = "Sem altura"
                End If
                If posteAlt.Exists(altKey) Then
                    posteAlt(altKey) = posteAlt(altKey) + 1
                Else
                    posteAlt.Add altKey, 1
                End If
                key = stat & "|" & arrLayer(i) & "|" & fam & "|" & _
                      NormalizarChave(nomeBase) & "|" & altKey
                If postesItem.Exists(key) Then
                    postesItem(key) = postesItem(key) + 1
                Else
                    postesItem.Add key, 1
                End If

            Case "COND NU", "COND ISOLADO"
                metros = ExtrairMetrosCabo(cont)
                spec   = NormalizarCabo(cont)
                key = stat & "|" & arrLayer(i) & "|" & fam & "|" & spec
                If cabosItem.Exists(key) Then
                    cabosItem(key) = cabosItem(key) + metros
                    cabosQtd(key)  = cabosQtd(key) + 1
                Else
                    cabosItem.Add key, metros
                    cabosQtd.Add key, 1
                End If

            Case Else
                key = stat & "|" & arrLayer(i) & "|" & fam & "|" & _
                      NormalizarChave(cont)
                If outroItem.Exists(key) Then
                    outroItem(key) = outroItem(key) + 1
                Else
                    outroItem.Add key, 1
                End If

        End Select
    Next i

    ' --- Escrita do Resumo --------------------------------------------------
    Dim row As Long
    row = 1

    ' Titulo geral
    ws2.Cells(row, 1).Value = "RESUMO DE MATERIAIS"
    With ws2.Range(ws2.Cells(row, 1), ws2.Cells(row, 6))
        .Merge
        .Font.Bold = True
        .Font.Size = 14
        .HorizontalAlignment = -4108
        .Interior.Color = RGB(31, 78, 120)
        .Font.Color = RGB(255, 255, 255)
    End With
    row = row + 1
    ws2.Cells(row, 1).Value = "Total geral de textos: " & n
    ws2.Cells(row, 1).Font.Italic = True
    row = row + 2

    Dim keys As Variant, k As Variant

    ' === SECAO 1: Total por familia ===
    row = EscreverSecao(ws2, row, "1. TOTAL POR FAMILIA DE MATERIAL", _
                        Array("Familia", "Quantidade"))
    keys = totFam.Keys
    Call OrdenarStringsDesc(keys, totFam)
    For Each k In keys
        ws2.Cells(row, 1).Value = k
        ws2.Cells(row, 2).Value = totFam(k)
        row = row + 1
    Next k
    ws2.Cells(row, 1).Value = "TOTAL"
    ws2.Cells(row, 2).Value = n
    With ws2.Range(ws2.Cells(row, 1), ws2.Cells(row, 2))
        .Font.Bold = True
        .Interior.Color = RGB(220, 230, 241)
    End With
    row = row + 3

    ' === SECAO 2: Total por status ===
    row = EscreverSecao(ws2, row, "2. TOTAL POR STATUS", _
                        Array("Status", "Quantidade"))
    keys = totStatus.Keys
    Call OrdenarStringsAsc(keys)
    For Each k In keys
        ws2.Cells(row, 1).Value = k
        ws2.Cells(row, 2).Value = totStatus(k)
        row = row + 1
    Next k
    row = row + 2

    ' === SECAO 3: Postes por altura ===
    If posteAlt.Count > 0 Then
        row = EscreverSecao(ws2, row, "3. POSTES POR ALTURA", _
                            Array("Altura", "Quantidade"))
        keys = posteAlt.Keys
        Call OrdenarChavesAlturaAsc(keys)
        totalPostes = 0
        For Each k In keys
            ws2.Cells(row, 1).Value = k
            ws2.Cells(row, 2).Value = posteAlt(k)
            totalPostes = totalPostes + CLng(posteAlt(k))
            row = row + 1
        Next k
        ws2.Cells(row, 1).Value = "TOTAL DE POSTES"
        ws2.Cells(row, 2).Value = totalPostes
        With ws2.Range(ws2.Cells(row, 1), ws2.Cells(row, 2))
            .Font.Bold = True
            .Interior.Color = RGB(220, 230, 241)
        End With
        row = row + 3
    End If

    ' === SECAO 4: Postes por modelo (com Status e Layer) ===
    If postesItem.Count > 0 Then
        row = EscreverSecao(ws2, row, "4. POSTES POR MODELO", _
                            Array("Status", "Layer", "Familia", "Modelo Base", "Altura", "Quantidade"))
        keys = postesItem.Keys
        Call OrdenarStringsAsc(keys)
        For Each k In keys
            partes = Split(CStr(k), "|", 6)
            ws2.Cells(row, 1).Value = partes(0)
            ws2.Cells(row, 2).Value = partes(1)
            ws2.Cells(row, 3).Value = partes(2)
            ws2.Cells(row, 4).Value = partes(3)
            ws2.Cells(row, 5).Value = partes(4)
            ws2.Cells(row, 6).Value = postesItem(k)
            row = row + 1
        Next k
        row = row + 2
    End If

    ' === SECAO 5: Cabos por especificacao (com Status e Layer) ===
    If cabosItem.Count > 0 Then
        row = EscreverSecao(ws2, row, "5. CONDUTORES (CABOS) POR ESPECIFICACAO", _
                            Array("Status", "Layer", "Tipo", "Especificacao", "Qtd Trechos", "Total (m)"))
        keys = cabosItem.Keys
        Call OrdenarStringsAsc(keys)
        totalMetros = 0
        For Each k In keys
            partes = Split(CStr(k), "|", 5)
            ws2.Cells(row, 1).Value = partes(0)
            ws2.Cells(row, 2).Value = partes(1)
            ws2.Cells(row, 3).Value = partes(2)
            ws2.Cells(row, 4).Value = partes(3)
            ws2.Cells(row, 5).Value = cabosQtd(k)
            ws2.Cells(row, 6).Value = cabosItem(k)
            totalMetros = totalMetros + CDbl(cabosItem(k))
            row = row + 1
        Next k
        ws2.Cells(row, 1).Value = "TOTAL"
        ws2.Cells(row, 6).Value = totalMetros
        With ws2.Range(ws2.Cells(row, 1), ws2.Cells(row, 6))
            .Font.Bold = True
            .Interior.Color = RGB(220, 230, 241)
        End With
        row = row + 3
    End If

    ' === SECAO 6: Demais materiais (com Status e Layer) ===
    If outroItem.Count > 0 Then
        row = EscreverSecao(ws2, row, "6. DEMAIS MATERIAIS POR TIPO", _
                            Array("Status", "Layer", "Familia", "Descricao", "Quantidade"))
        keys = outroItem.Keys
        Call OrdenarStringsAsc(keys)
        For Each k In keys
            partes = Split(CStr(k), "|", 5)
            ws2.Cells(row, 1).Value = partes(0)
            ws2.Cells(row, 2).Value = partes(1)
            ws2.Cells(row, 3).Value = partes(2)
            If UBound(partes) >= 3 Then
                ws2.Cells(row, 4).Value = partes(3)
            End If
            ws2.Cells(row, 5).Value = outroItem(k)
            row = row + 1
        Next k
        row = row + 1
    End If

    ' Larguras das colunas do Resumo
    ws2.Columns("A").ColumnWidth = 26
    ws2.Columns("B").ColumnWidth = 34
    ws2.Columns("C").ColumnWidth = 18
    ws2.Columns("D").ColumnWidth = 38
    ws2.Columns("E").ColumnWidth = 16
    ws2.Columns("F").ColumnWidth = 16

    ' --- Graficos -----------------------------------------------------------
    estagio = "graficos do Resumo"
    If totFam.Count > 0 Then Call AdicionarGraficos(ws2, totFam, totStatus, row)

    ' =====================================================================
    '  LEITURA DE BLOCOS (postes + cabos) -- feita ANTES das abas Mat.*
    ' =====================================================================
    Dim bnome() As String, blayer() As String, bstatus() As String
    Dim bNumero() As String, bExistente() As String, bProjetado() As String
    Dim bEstai() As String, bOcupantes() As String, bCoordZ() As String
    Dim bX() As Double, bY() As Double
    Dim bNomeBaseExist() As String, bNomeBaseProj() As String
    Dim nB As Long
    estagio = "lendo blocos (postes)"
    Call LerBlocosComAtributos(bnome, blayer, bstatus, bNumero, bExistente, _
                                bProjetado, bEstai, bOcupantes, bCoordZ, _
                                bX, bY, bNomeBaseExist, bNomeBaseProj, nB)

    Dim cNome() As String, cLayer() As String, cStatus() As String
    Dim cCabo() As String, cFamiliaCabo() As String
    Dim cDistancia() As String, cDistCalc() As String, cMetros() As Double
    Dim cAmFase() As String, cAmNeutro() As String, cDistObr() As String
    Dim cXX() As Double, cYY() As Double
    Dim nC As Long
    estagio = "lendo blocos (cabos)"
    Call LerBlocosCabo(cNome, cLayer, cStatus, cCabo, cFamiliaCabo, _
                        cDistancia, cDistCalc, cMetros, cAmFase, cAmNeutro, _
                        cDistObr, cXX, cYY, nC)

    ' --- Le OUTROS materiais (trafo, chave, religador, para-raio, etc.) ----
    Dim oNome() As String, oLayer() As String, oStatus() As String
    Dim oFamilia() As String, oDesc() As String
    Dim oX() As Double, oY() As Double
    Dim nO As Long
    estagio = "lendo blocos (outros)"
    Call LerBlocosOutros(oNome, oLayer, oStatus, oFamilia, oDesc, oX, oY, nO)

    ' --- Le blocos do padrao PIAUI (PLPT) — simbolos por nome ---------------
    Dim pNome() As String, pFam() As String, pStat() As String
    Dim pDesc() As String, pX() As Double, pY() As Double
    Dim nP As Long
    estagio = "lendo blocos (Piaui)"
    Call LerBlocosPiaui(pNome, pFam, pStat, pDesc, pX, pY, nP)

    ' --- Monta arrays UNIFICADOS de blocos (postes + cabos + outros + Piaui) -
    Dim uTipo() As String, uBloco() As String, uStat() As String
    Dim uNum() As String, uDesc() As String, uBase() As String
    Dim uDist() As String, uMet() As Double, uX() As Double, uY() As Double
    Dim uFam() As String
    Dim nU As Long
    nU = nB + nC + nO + nP
    If nU < 1 Then nU = 1
    ReDim uTipo(1 To nU)
    ReDim uBloco(1 To nU)
    ReDim uStat(1 To nU)
    ReDim uNum(1 To nU)
    ReDim uDesc(1 To nU)
    ReDim uBase(1 To nU)
    ReDim uDist(1 To nU)
    ReDim uMet(1 To nU)
    ReDim uX(1 To nU)
    ReDim uY(1 To nU)
    ReDim uFam(1 To nU)

    ' Helper: retorna True se descricao comecar com MT ou BT (cabo)
    ' Usado para reclassificar blocos de poste/outro que descrevem cabos.

    Dim u As Long, kb As Long
    u = 0
    For kb = 1 To nB
        Dim descB As String, tipoB As String, famB As String, baseB As String
        If Len(bProjetado(kb)) > 0 And Len(bExistente(kb)) = 0 Then
            descB = bProjetado(kb)
            baseB = bNomeBaseProj(kb)
        ElseIf Len(bExistente(kb)) > 0 And Len(bProjetado(kb)) = 0 Then
            descB = bExistente(kb)
            baseB = bNomeBaseExist(kb)
        Else
            ' Else: ambos vazios OU ambos preenchidos -> PULA
            GoTo ProxPoste
        End If

        ' Reclassificacao por descricao:
        '   - contem "ATERR"      -> ATERRAMENTO
        '   - comeca com MT ou BT -> CABO
        '   - caso contrario      -> POSTE
        Dim desc2U As String, descUpB As String
        desc2U  = UCase$(Left$(Trim$(descB), 2))
        descUpB = UCase$(Trim$(descB))
        If InStr(descUpB, "ATERR") > 0 Then
            tipoB = "ATERRAMENTO"
            famB  = "ATERRAMENTO"
        ElseIf desc2U = "MT" Or desc2U = "BT" Then
            tipoB = "CABO"
            famB  = "CABO"
        ElseIf Len(baseB) > 0 And ContaDigitosBase(baseB) = 1 Then
            ' Nome base com 1 digito (CE1, N3, CUF3...) = ESTRUTURA, nao POSTE
            tipoB = "ESTRUTURA"
            famB  = "ESTRUTURA"
        Else
            tipoB = "POSTE"
            famB  = "POSTE"
        End If

        ' Se descricao comecar com "#" -> forcar DESINSTALADOS (regra universal)
        Dim statB As String
        statB = bstatus(kb)
        If Left$(Trim$(descB), 1) = "#" Then
            statB = "MATERIAIS DESINSTALADOS"
        End If

        u = u + 1
        uTipo(u)  = tipoB
        uFam(u)   = famB
        uBloco(u) = bnome(kb)
        uStat(u)  = statB
        uNum(u)   = bNumero(kb)
        uDesc(u)  = descB
        uBase(u)  = baseB
        uDist(u)  = ""
        uMet(u)   = 0
        uX(u)     = bX(kb)
        uY(u)     = bY(kb)
ProxPoste:
    Next kb
    nB = u  ' Atualiza nB com o total de postes apos filtro
    For kb = 1 To nC
        u = u + 1
        Dim dd As String
        dd = Trim$(cDistCalc(kb))
        If Len(dd) = 0 Then
            If cMetros(kb) > 0 Then
                dd = Format$(cMetros(kb), "0.0") & "m"
            ElseIf Len(Trim$(cDistancia(kb))) > 0 Then
                dd = Trim$(cDistancia(kb)) & "m"
            End If
        End If
        ' Descrição do cabo: "TCABO  DISTANCIA" (ex: "MT 1#1/0CAA-25kV  485,5m")
        Dim descCabo As String
        descCabo = Trim$(cCabo(kb))
        If Len(dd) > 0 Then
            If Len(descCabo) > 0 Then descCabo = descCabo & "  "
            descCabo = descCabo & dd
        End If
        uTipo(u) = "CABO"
        uFam(u) = "CABO"
        uBloco(u) = cNome(kb)
        uStat(u) = cStatus(kb)
        uNum(u) = ""
        uDesc(u) = descCabo
        uBase(u) = cFamiliaCabo(kb)
        uDist(u) = dd
        uMet(u) = cMetros(kb)
        uX(u) = cXX(kb)
        uY(u) = cYY(kb)
    Next kb
    For kb = 1 To nO
        u = u + 1
        ' Se descricao comecar com MT ou BT -> reclassifica como CABO
        Dim descOU As String
        descOU = UCase$(Left$(Trim$(oDesc(kb)), 2))
        Dim tipoO As String, famO As String
        If descOU = "MT" Or descOU = "BT" Then
            tipoO = "CABO"
            famO  = "CABO"
        Else
            tipoO = oFamilia(kb)
            famO  = oFamilia(kb)
        End If
        ' Se descricao comecar com "#" -> forcar DESINSTALADOS
        Dim statO As String
        statO = oStatus(kb)
        If Left$(Trim$(oDesc(kb)), 1) = "#" Then
            statO = "MATERIAIS DESINSTALADOS"
        End If
        uTipo(u) = tipoO
        uFam(u)  = famO
        uBloco(u) = oNome(kb)
        uStat(u) = statO
        uNum(u) = ""
        uDesc(u) = oDesc(kb)
        uBase(u) = ""
        uDist(u) = ""
        uMet(u) = 0
        uX(u) = oX(kb)
        uY(u) = oY(kb)
    Next kb

    ' Blocos do padrao PIAUI (simbolos por nome)
    For kb = 1 To nP
        u = u + 1
        uTipo(u)  = pFam(kb)
        uFam(u)   = pFam(kb)
        uBloco(u) = pNome(kb)
        uStat(u)  = pStat(kb)
        uNum(u)   = ""
        uDesc(u)  = pDesc(kb)
        uBase(u)  = ""
        uDist(u)  = ""
        uMet(u)   = 0
        uX(u)     = pX(kb)
        uY(u)     = pY(kb)
    Next kb

    ' Atualiza nU para refletir filtros
    nU = u

    ' =====================================================================
    '  ABAS DE STATUS (agora com secao de BLOCOS do mesmo status)
    ' =====================================================================
    Dim wsUlt As Object

    estagio = "aba Mat. Instalados"
    Call CriarAbaStatus(wb, ws2, "Mat. Instalados", "MATERIAIS INSTALADOS", _
                        arrLayer, arrAci, arrCor, arrTexto, arrFam, arrStatus, _
                        arrX, arrY, arrH, n, _
                        uTipo, uBloco, uStat, uNum, uDesc, uBase, uDist, uMet, _
                        uX, uY, nU)

    estagio = "aba Mat. Desinstalados"
    Set wsUlt = wb.Worksheets(wb.Worksheets.Count)
    Call CriarAbaStatus(wb, wsUlt, "Mat. Desinstalados", "MATERIAIS DESINSTALADOS", _
                        arrLayer, arrAci, arrCor, arrTexto, arrFam, arrStatus, _
                        arrX, arrY, arrH, n, _
                        uTipo, uBloco, uStat, uNum, uDesc, uBase, uDist, uMet, _
                        uX, uY, nU)

    estagio = "aba Mat. Existentes"
    Set wsUlt = wb.Worksheets(wb.Worksheets.Count)
    Call CriarAbaStatus(wb, wsUlt, "Mat. Existentes", "MATERIAIS EXISTENTES", _
                        arrLayer, arrAci, arrCor, arrTexto, arrFam, arrStatus, _
                        arrX, arrY, arrH, n, _
                        uTipo, uBloco, uStat, uNum, uDesc, uBase, uDist, uMet, _
                        uX, uY, nU)

    ' =====================================================================
    '  ABAS AUXILIARES (mantidas mas OCULTAS): Alertas, Vinculos, BOM
    '  So fazem sentido com TEXTOS -> puladas quando n = 0 (so blocos).
    ' =====================================================================
    Dim arrPosteProximo() As String
    Dim arrDistPoste() As Double
    If n > 0 Then
        estagio = "aba Alertas"
        Call CriarAbaAlertas(wb, arrLayer, arrStatus, arrFam, arrTexto, arrNomeBase, _
                             arrConfianca, arrX, arrY, n)

        ReDim arrPosteProximo(1 To n)
        ReDim arrDistPoste(1 To n)
        Call CalcularProximidade(arrFam, arrNomeBase, arrX, arrY, n, _
                                  arrPosteProximo, arrDistPoste)
        estagio = "aba Vinculos"
        Call CriarAbaVinculos(wb, arrLayer, arrStatus, arrFam, arrTexto, _
                              arrNomeBase, arrPosteProximo, arrDistPoste, _
                              arrX, arrY, n)

        estagio = "aba BOM"
        Call CriarAbaBOM(wb, arrLayer, arrStatus, arrFam, arrTexto, _
                         arrNomeBase, n)
    End If

    ' =====================================================================
    '  ABA UNIFICADA "Blocos" (organizada por familia em secoes)
    ' =====================================================================
    estagio = "aba Blocos (por familia)"
    Call CriarAbaBlocosPorFamilia(wb, uTipo, uFam, uBloco, uStat, uNum, _
            uDesc, uBase, uDist, uMet, uX, uY, nU, nB, nC, nO)

    ' =====================================================================
    '  OCULTA as abas auxiliares (mantem, mas escondidas)
    ' =====================================================================
    On Error Resume Next
    wb.Worksheets("Alertas").Visible = 0      ' xlSheetHidden
    wb.Worksheets("Vinculos").Visible = 0
    wb.Worksheets("Quantitativo (BOM)").Visible = 0
    On Error GoTo TratarErro

    ' =====================================================================
    '  REORDENA: "Blocos" como primeira aba
    ' =====================================================================
    On Error Resume Next
    Dim wsMove As Object
    Set wsMove = Nothing
    Set wsMove = wb.Worksheets("Blocos")
    If Not wsMove Is Nothing Then
        wsMove.Move Before:=wb.Worksheets(1)
    End If
    On Error GoTo TratarErro

    ' =====================================================================
    '  PAINEL (dashboard de analise rapida) como PRIMEIRA aba
    ' =====================================================================
    On Error Resume Next
    Call CriarAbaPainel(wb, uFam, uStat, nU, nB, nC, nO, arrStatus, n)
    On Error GoTo TratarErro

    ' Ativa a primeira aba (PAINEL) e salva
    estagio = "ativando aba e salvando arquivo"
    wb.Worksheets(1).Activate
    wb.SaveAs outPath, 51  ' xlOpenXMLWorkbook
    wb.Close False
    xl.Quit
    Set ws2 = Nothing
    Set ws  = Nothing
    Set wb  = Nothing
    Set xl  = Nothing

    MostrarAnimacaoVelocidade n, nB, nC, nO, nP, outPath
    Exit Sub

TratarErro:
    ' Captura os dados do erro ANTES de qualquer On Error (que zera o Err)
    errNum = Err.Number
    errDesc = Err.Description
    errSrc = Err.Source
    On Error Resume Next
    If Not xl Is Nothing Then
        xl.DisplayAlerts = False
        xl.Quit
    End If
    On Error GoTo 0
    MsgBox "Erro durante a exportacao:" & vbCrLf & vbCrLf & _
           "  Numero: " & errNum & vbCrLf & _
           "  Descricao: " & errDesc & vbCrLf & _
           "  Origem: " & errSrc & vbCrLf & _
           "  Estagio: " & estagio, _
           vbCritical, "Erro"
End Sub

' =============================================================================
'  TELA DE RESULTADO — design minimalista via HTA
'  Gera um arquivo HTML Application (.hta) temporario com layout limpo (flat),
'  sem animacoes, exibindo as estatisticas da exportacao.
'  Requer Windows com mshta.exe (presente em todas versoes Win7+).
' =============================================================================
Private Sub MostrarAnimacaoVelocidade(ByVal nTxt As Long, ByVal nPos As Long, _
                                       ByVal nCab As Long, ByVal nOut As Long, _
                                       ByVal nPia As Long, _
                                       ByVal caminhoArq As String)
    On Error GoTo FallbackMsgV

    Dim htaPath As String
    htaPath = Environ("TEMP") & "\zwcad_resultado.hta"

    ' --- Monta o HTML/HTA em partes ---
    Dim H As String
    H = "<!DOCTYPE html><html><head><meta charset='UTF-8'>"
    H = H & "<title>ZWCAD - Exportar Textos v3.4</title>"
    H = H & "<HTA:APPLICATION APPLICATIONNAME='ZWCADExport' "
    H = H & "MAXIMIZEBUTTON='no' MINIMIZEBUTTON='no' SCROLL='no' "
    H = H & "SINGLEINSTANCE='yes' BORDER='thin' INNERBORDER='no' SHOWINTASKBAR='yes'/>"
    H = H & "<script>window.onload=function(){"
    H = H & "window.resizeTo(460,500);"
    H = H & "window.moveTo(Math.round((screen.availWidth-460)/2),"
    H = H & "Math.round((screen.availHeight-500)/2));};</script>"
    H = H & "<style>"
    H = H & "*{box-sizing:border-box;margin:0;padding:0;"
    H = H & "font-family:'Segoe UI',Arial,sans-serif}"
    H = H & "body{background:#ffffff;color:#202020;width:460px;overflow:hidden}"
    H = H & ".wrap{padding:26px 30px}"
    H = H & ".check{font-size:34px;color:#2e9e5b;line-height:1}"
    H = H & ".ttl{font-size:17px;font-weight:600;color:#1a1a1a;margin:10px 0 2px}"
    H = H & ".sub{font-size:12px;color:#888;margin-bottom:20px}"
    H = H & ".grid{border-top:1px solid #ececec}"
    H = H & ".row{display:table;width:100%;border-bottom:1px solid #ececec;"
    H = H & "padding:9px 2px}"
    H = H & ".row .k{display:table-cell;font-size:13px;color:#555}"
    H = H & ".row .v{display:table-cell;text-align:right;font-size:13px;"
    H = H & "font-weight:600;color:#1a1a1a}"
    H = H & ".note{font-size:11px;color:#999;margin:16px 0 4px;line-height:1.6}"
    H = H & ".path{font-size:11px;color:#3a78c2;word-break:break-all;"
    H = H & "background:#f6f8fa;border:1px solid #ececec;border-radius:4px;"
    H = H & "padding:8px 10px;margin-top:6px}"
    H = H & ".bar{text-align:right;padding:14px 30px;border-top:1px solid #ececec;"
    H = H & "background:#fafafa}"
    H = H & ".btn{background:#2e7d46;color:#fff;font-size:13px;font-weight:600;"
    H = H & "padding:8px 26px;border:0;border-radius:5px;cursor:pointer}"
    H = H & ".btn:hover{background:#266b3b}"
    H = H & "</style></head><body>"
    H = H & "<div class='wrap'>"
    H = H & "<div class='check'>&#10004;</div>"
    H = H & "<div class='ttl'>Exportacao concluida</div>"
    H = H & "<div class='sub'>ZWCAD &mdash; Exportar Textos v3.4</div>"
    H = H & "<div class='grid'>"
    H = H & "<div class='row'><span class='k'>Total de textos</span>"
    H = H & "<span class='v'>" & nTxt & "</span></div>"
    H = H & "<div class='row'><span class='k'>Blocos de poste</span>"
    H = H & "<span class='v'>" & nPos & "</span></div>"
    H = H & "<div class='row'><span class='k'>Blocos de cabo</span>"
    H = H & "<span class='v'>" & nCab & "</span></div>"
    H = H & "<div class='row'><span class='k'>Outros materiais</span>"
    H = H & "<span class='v'>" & nOut & "</span></div>"
    H = H & "<div class='row'><span class='k'>Blocos padrao Piaui</span>"
    H = H & "<span class='v'>" & nPia & "</span></div>"
    H = H & "</div>"
    H = H & "<div class='note'>Filtro aplicado: blocos com ambos "
    H = H & "Existente e Projetado (<i>'Exist: | Proj:'</i>) foram excluidos.</div>"
    H = H & "<div class='path'>" & Replace(caminhoArq, "\", "&#92;") & "</div>"
    H = H & "</div>"
    H = H & "<div class='bar'>"
    H = H & "<button class='btn' onclick='window.close()'>OK</button></div>"
    H = H & "</body></html>"

    ' --- Grava o arquivo HTA no diretorio temporario ---
    Dim ff As Integer
    ff = FreeFile
    Open htaPath For Output As #ff
    Print #ff, H
    Close #ff

    ' --- Lanca o HTA (assincrono: macro termina, janela fica aberta) ---
    Shell "mshta.exe """ & htaPath & """"
    Exit Sub

FallbackMsgV:
    ' Fallback: se o HTA falhar por qualquer motivo, exibe MsgBox classica
    MsgBox "Exportacao concluida com sucesso!" & vbCrLf & vbCrLf & _
           "Total de textos: " & nTxt & vbCrLf & _
           "Blocos de poste: " & nPos & "   |   Blocos de cabo: " & nCab & vbCrLf & _
           "Outros materiais (trafo, chave, etc.): " & nOut & vbCrLf & _
           "Blocos padrao Piaui: " & nPia & vbCrLf & vbCrLf & _
           "Arquivo salvo em:" & vbCrLf & caminhoArq, _
           vbInformation, "ZWCAD - Exportar Textos v3.4"
End Sub
