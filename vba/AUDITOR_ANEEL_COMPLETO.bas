Attribute VB_Name = "AUDITOR_ANEEL_COMPLETO"
'==============================================================================
'  AUDITOR ANEEL COMPLETO — VBA Unificado de Análise Regulatória BRR
'  Versão 2.0 | Maio 2026 | Grupo Equatorial Energia / CEEE-Equatorial RS
'
'  Combina três módulos:
'    ► AnaliseCKCP   — Análise de Custos por Classe/Material/Serviço/CA
'    ► AUDITOR_ANEEL — 8 Testes Forenses BRR (Duplicidades, ATV DRT,
'                      Retroativos, Estornos, Fornecedores, Benford,
'                      Sobrepreço, Classificação) + Dashboard e Score
'    ► EXTENSÃO BRR  — 12 Testes regulatórios adicionais sobre o que a
'                      ANEEL/SFF audita em obras de distribuidoras:
'                      OPEX em ODI, CAPEX em ODM/ODD, Despesas Vedadas,
'                      Obrigações Especiais, AIC/Unitização, JOA,
'                      Custos Adicionais/COM, Ativos Administrativos (BAR),
'                      Duplicidade entre Obras, Integridade Cadastral,
'                      Obra sem Lastro Físico, Terrenos/Servidões.
'                      Normas: PRORET 2.3, MCPSE 674/2015, MCSE 396/2010,
'                      REN 1000/2021, REN 1.058/2023, CPC 20.
'    ► FORENSE DADOS — 7 Testes de auditoria forense sobre os lançamentos:
'                      Valores Redondos, Fim de Semana/Feriados, Cutoff de
'                      Exercício, Fracionamento, Benford 2º dígito,
'                      Concentração por Usuário, Estorno + Relançamento.
'                      Referências: ISA 240, Nigrini 2012, praxe TCU/CGU.
'
'  TOTAL: 27 testes + Dashboard + Resumo Executivo + Score de Compliance.
'
'  ENTRY POINTS:
'    • Alt+F8 → GerarRelatorio()       — Análise completa CKCP/CA/Classes
'    • Alt+F8 → AUDITOR_ANEEL_Main()   — Auditoria forense BRR (9 testes)
'
'  INSTALAÇÃO:
'    1. Alt+F11 > Arquivo > Importar Arquivo > selecione este .bas
'    2. A base crua do SAP deve estar na 1ª aba (para GerarRelatorio) ou
'       em aba nomeada DADOS (para AUDITOR_ANEEL_Main)
'==============================================================================
Option Explicit


'##############################################################################
'#                                                                            #
'#   MÓDULO 1 — CKCP: ANÁLISE DE CUSTOS / CLASSES / MATERIAIS / CA           #
'#   (GerarRelatorio, ColLike, SemAcento, Catálogos, Abas de Análise)        #
'#                                                                            #
'##############################################################################

'==============================================================================
'  CKCP RS2 - Anlise de Custos (VBA)
'  Transforma a base crua do SAP (EXPORT) na estrutura de relatrio.
'
'  COMO USAR:
'   1. Abra o EXPORT.XLSX (ou cole os dados crus na 1 aba).
'   2. Alt+F11 > Inserir > Mdulo > cole este cdigo (ou importe este .bas).
'   3. Feche o editor, Alt+F8 > GerarRelatorio > Executar.
'
'  A base crua deve ter os cabealhos do SAP na linha 1, incluindo:
'   "Elemento PEP", "Classe de custo", "Material", "Qtd.total entrada",
'   "Valor/moeda objeto", "Classificao", "Descrio SA", etc.
'==============================================================================

' --- ndices das colunas da base crua (preenchidos por MapearColunas) ---------
Private cPEP As Long, cClasse As Long, cDescClasse As Long, cMaterial As Long
Private cTexto As Long, cQtd As Long, cUML As Long, cValor As Long
Private cClassif As Long, cDescSA As Long, cCentro As Long, cEmpresa As Long
Private cObj As Long, cDenObj As Long, cDenClasse As Long, cDocCompra As Long
Private cNumDoc As Long, cDenominacao As Long, cUsuario As Long, cNumDocRef As Long
Private cDataLanc As Long, cHora As Long, cDataEntrada As Long, cTipoDoc As Long
Private cAno As Long, cDivisao As Long, cDataDoc As Long, cLinhaLanc As Long
Private cODI As Long, cSA As Long, cDocEstorno As Long, cOrgEstorno As Long
Private cEstorno As Long, cRefEstorno As Long, cOperRef As Long
Private cCLS1Raw As Long, cCLS2Raw As Long, cCLS3Raw As Long, cTipoAplicRaw As Long

' --- Estilo -------------------------------------------------------------------
Private Const COR_HDR As Long = &H7D491F          ' azul escuro 1F497D (BGR)
Private Const COR_OK As Long = &HCEEFC6           ' verde claro
Private Const COR_BAD As Long = &HCEC7FF          ' vermelho claro

Private wsRaw As Worksheet
Private dados As Variant
Private nLin As Long
Private dCatMat As Object   ' COD_MATERIAL(str) -> "FAMILIA|CLS1|CLS2|CLS3"
Private dCatSrv As Object   ' COD_SERVICO(str) -> "CLS1|CLS2|CLS3|TIPO_APLIC|SEGMENTO"
Private dCatCC As Object    ' CLASSE_CUSTO(str) -> "CLS1|CLS2|CLS3|TIPO_APLIC"
Private dCabo As Object     ' COD_MATERIAL(str) -> fator KG->metros (Double)
Private dCombo As Object    ' COD_SERVICO(str)  -> fator multiplicador (Double)
Private dPU As Object       ' COD_MATERIAL(str) -> "MIN|MAX" para preco unitario
Private dTipoCls As Object  ' CLASSIFICACAO(CLS2 normalizada) -> TIPO (COM/UC/UAR)
Private rawHeaders As Variant
Private rawColCount As Long


'==============================================================================
'  ROTINA PRINCIPAL
'==============================================================================
Sub GerarRelatorio()
    Dim t As Double: t = Timer
    Application.ScreenUpdating = False
    Application.Calculation = xlCalculationManual
    Application.DisplayAlerts = False

    On Error GoTo Falha

    ' 1) Localiza a aba com a base crua
    Set wsRaw = LocalizarBase()
    If wsRaw Is Nothing Then
        MsgBox "Nao encontrei a base crua. Verifique se ha uma aba com a coluna " & _
               "'Elemento PEP'.", vbExclamation: GoTo Fim
    End If

    ' 2) Mapeia colunas pelos cabealhos
    If Not MapearColunasRel(wsRaw) Then
        MsgBox "Nao encontrei as colunas obrigatorias (Elemento PEP, Classificacao, " & _
               "Valor/moeda objeto, Qtd.total entrada e Material).", vbExclamation: GoTo Fim
    End If

    ' 3) Carrega os dados para memria (rpido)
    CarregarDados wsRaw
    If nLin = 0 Then
        MsgBox "A base foi localizada, mas nao ha linhas de dados para processar.", vbExclamation
        GoTo Fim
    End If

    ' 3b) Carrega o catlogo de MATERIAIS (FAMILIA, CLS1/2/3)
    CarregarCatalogoMateriais

    ' 3c) Carrega o catlogo de SERVIOS (CLS1/2/3, TIPO_APLIC, SEGMENTO)
    CarregarCatalogoServicos

    ' 3d) Carrega o catlogo de CLASSE DE CUSTO (CLS1/2/3 + TIPO_APLIC; marca RISCO)
    CarregarCatalogoClasse

    ' 3e) Carrega conversao de cabo (KG->m) e SRV COMBO (fator multiplicador)
    '     - usados para refinar a aderncia MATERIAL vs SERVICO (ajuste fino)
    CarregarConversoesCabo
    CarregarComboServico

    ' 3f) Carrega faixas de preco unitario, quando houver planilha de referencia.
    CarregarPrecoReferencia

    ' 3g) De-para CLASSIFICACAO (familia/CLS2) -> TIPO (COM/UC/UAR)
    CarregarTipoClassif

    ' 4) Gera cada aba
    '    (PEND CLASSIFICACAO, RESUMO POR PEP e CLASSIFICACAO desativadas a pedido)
    Gerar_RazaoCJ
    Gerar_MaterialVsServico
    Gerar_Material
    Gerar_Servico
    Gerar_PrecoUnitario
    Gerar_AnaliseCA
    Gerar_ClasseDeCusto
    Gerar_Risco
    Gerar_Anomalias

    Application.Calculation = xlCalculationAutomatic
    Application.ScreenUpdating = True
    MsgBox "Relatorio gerado com sucesso!" & vbCrLf & _
           "Linhas processadas: " & Format(nLin, "#,##0") & vbCrLf & _
           "Tempo: " & Format(Timer - t, "0.0") & "s", vbInformation
    GoTo Fim

Falha:
    MsgBox "Erro: " & Err.Description, vbCritical
Fim:
    Application.ScreenUpdating = True
    Application.Calculation = xlCalculationAutomatic
    Application.DisplayAlerts = True
End Sub


'==============================================================================
'  PREPARAO
'==============================================================================
Private Function LocalizarBase() As Worksheet
    Dim ws As Worksheet, c As Range

    ' Prioriza a base crua do SAP. Abas geradas pelo proprio relatorio tambem
    ' podem ter "PEP" na linha 1, entao o fallback abaixo e mais restritivo.
    For Each ws In ActiveWorkbook.Worksheets
        Set c = ws.Rows(1).Find("Elemento PEP", LookAt:=xlWhole)
        If Not c Is Nothing Then Set LocalizarBase = ws: Exit Function
    Next ws

    Dim melhor As Worksheet, melhorScore As Long, score As Long
    For Each ws In ActiveWorkbook.Worksheets
        ' Aceita tambm base j normalizada com cabealho "PEP"
        Set c = ws.Rows(1).Find("PEP", LookAt:=xlWhole)
        If Not c Is Nothing Then
            If TemCabecalhosMinimos(ws) Then
                score = PontuarBase(ws)
                If score > melhorScore Then
                    Set melhor = ws
                    melhorScore = score
                End If
            End If
        End If
    Next ws
    If Not melhor Is Nothing Then Set LocalizarBase = melhor
End Function

Private Function MapearColunasRel(ws As Worksheet) As Boolean
    ' Busca por fragmentos SEM acento (robusto a problemas de codificao).
    cPEP = ColLike(ws, Array("ELEMENTO PEP", "PEP"))
    cClasse = ColLike(ws, Array("CLASSE DE CUSTO", "CLASSE_CUSTO", "CLASSE CUSTO"))
    cDescClasse = ColLike(ws, Array("DESCR.CLASSE", "DENOM.CLASSE", "DESC_CLASSE"))
    cMaterial = ColLike(ws, Array("MATERIAL"))
    cTexto = ColLike(ws, Array("TEXTO BREVE", "TEXTO_MATERIAL"))
    cQtd = ColLike(ws, Array("QTD.TOTAL", "QTD_ENTRADA", "QTD ENTRADA"))
    cUML = ColLike(ws, Array("UNID.MEDIDA", "UML"))
    cValor = ColLike(ws, Array("VALOR/MOEDA", "VALOR_MOEDA", "VALOR MOEDA"))
    cClassif = ColLike(ws, Array("CLASSIFICA"))        ' Classificao
    cDescSA = ColLike(ws, Array("DESCRICAO SA", "DESCRICAO_SA", "DESCR SA")) ' Descrio SA
    cCentro = ColLike(ws, Array("CENTRO"))
    cEmpresa = ColLike(ws, Array("EMPRESA", "DIVISAO"))
    cObj = ColLike(ws, Array("OBJETO"))
    cDenObj = ColLike(ws, Array("DENOMINACAO_OBJETO", "DENOMINACAO OBJETO"))
    cDenClasse = ColLike(ws, Array("DENOM_CLASSE_CUSTO", "DENOM CLASSE CUSTO"))
    cDocCompra = ColLike(ws, Array("DOC_COMPRA", "DOC COMPRA"))
    cNumDoc = ColLike(ws, Array("NUM_DOC", "NUM DOC"))
    cDenominacao = ColLike(ws, Array("DENOMINACAO"))
    cUsuario = ColLike(ws, Array("USUARIO"))
    cNumDocRef = ColLike(ws, Array("NUM_DOC_REF", "NUM DOC REF"))
    cDataLanc = ColLike(ws, Array("DATA_LANCAMENTO", "DATA LANCAMENTO"))
    cHora = ColLike(ws, Array("HORA"))
    cDataEntrada = ColLike(ws, Array("DATA_ENTRADA", "DATA ENTRADA"))
    cTipoDoc = ColLike(ws, Array("TIPO_DOC", "TIPO DOC"))
    cAno = ColLike(ws, Array("ANO"))
    cDivisao = ColLike(ws, Array("DIVISAO", "EMPRESA"))
    cDataDoc = ColLike(ws, Array("DATA_DOCUMENTO", "DATA DOCUMENTO"))
    cLinhaLanc = ColLike(ws, Array("LINHA LANCAMENTO", "LINHA_LANCAMENTO"))
    cODI = ColLike(ws, Array("ODI_ANEEL", "ODI ANEEL"))
    cSA = ColLike(ws, Array("SA"))
    cDocEstorno = ColLike(ws, Array("DOC_ESTORNO", "DOC ESTORNO"))
    cOrgEstorno = ColLike(ws, Array("ORG_ESTORNO", "ORG ESTORNO"))
    cEstorno = ColLike(ws, Array("ESTORNO"))
    cRefEstorno = ColLike(ws, Array("REF_ESTORNO", "REF ESTORNO"))
    cOperRef = ColLike(ws, Array("OPERACAO_REFERENCIA", "OPERACAO REFERENCIA"))
    cCLS1Raw = ColLike(ws, Array("CLS1"))
    cCLS2Raw = ColLike(ws, Array("CLS2"))
    cCLS3Raw = ColLike(ws, Array("CLS3"))
    cTipoAplicRaw = ColLike(ws, Array("TIPO_APLICACAO", "TIPO APLICACAO", "TIPO APLIC"))
    MapearColunasRel = TemCabecalhosMinimos(ws)
End Function

Private Function TemCabecalhosMinimos(ws As Worksheet) As Boolean
    TemCabecalhosMinimos = _
        (ColLike(ws, Array("ELEMENTO PEP", "PEP")) > 0) And _
        (ColLike(ws, Array("CLASSIFICA")) > 0) And _
        (ColLike(ws, Array("VALOR/MOEDA", "VALOR_MOEDA", "VALOR MOEDA")) > 0) And _
        (ColLike(ws, Array("QTD.TOTAL", "QTD_ENTRADA", "QTD ENTRADA")) > 0) And _
        (ColLike(ws, Array("MATERIAL")) > 0)
End Function

Private Function PontuarBase(ws As Worksheet) As Long
    PontuarBase = ws.Cells(ws.Rows.Count, ColLike(ws, Array("ELEMENTO PEP", "PEP"))).End(xlUp).Row
    If ColLike(ws, Array("NUM_DOC", "NUM DOC")) > 0 Then PontuarBase = PontuarBase + 1000000
    If ColLike(ws, Array("DATA_LANCAMENTO", "DATA LANCAMENTO")) > 0 Then PontuarBase = PontuarBase + 1000000
    If ColLike(ws, Array("OPERACAO_REFERENCIA", "OPERACAO REFERENCIA")) > 0 Then PontuarBase = PontuarBase + 1000000
    If ColLike(ws, Array("OBJETO")) > 0 Then PontuarBase = PontuarBase + 1000000
End Function

' Procura a 1 coluna cujo cabealho CONTM qualquer fragmento da lista
' (case-insensitive, ignora acentos). Prioriza correspondncia exata.
Private Function ColLike(ws As Worksheet, frags As Variant) As Long
    Dim ult As Long, j As Long, i As Long, hdr As String, fr As String
    ult = ws.Cells(1, ws.Columns.Count).End(xlToLeft).Column
    ' 1 passada: igualdade exata (sem acento)
    For i = LBound(frags) To UBound(frags)
        fr = SemAcento(UCase$(CStr(frags(i))))
        For j = 1 To ult
            hdr = SemAcento(UCase$(Trim$(CStr(ws.Cells(1, j).Value))))
            If hdr = fr Then ColLike = j: Exit Function
        Next j
    Next i
    ' 2 passada: contm o fragmento
    For i = LBound(frags) To UBound(frags)
        fr = SemAcento(UCase$(CStr(frags(i))))
        For j = 1 To ult
            hdr = SemAcento(UCase$(Trim$(CStr(ws.Cells(1, j).Value))))
            If InStr(hdr, fr) > 0 Then ColLike = j: Exit Function
        Next j
    Next i
    ColLike = 0
End Function

' Remove acentos comuns para comparao robusta (usa cdigos Unicode - imune
' a problemas de codificao do arquivo).
Private Function SemAcento(ByVal s As String) As String
    Dim cods As Variant, subs As Variant, k As Long
    s = UCase$(s)
    ' maisculas:
    cods = Array(192, 193, 194, 195, 196, 201, 202, 200, 205, 206, 211, 212, 213, 214, 218, 219, 199)
    subs = Array("A", "A", "A", "A", "A", "E", "E", "E", "I", "I", "O", "O", "O", "O", "U", "U", "C")
    For k = LBound(cods) To UBound(cods)
        s = Replace(s, ChrW(CLng(cods(k))), subs(k))
    Next k
    SemAcento = s
End Function

Private Sub CarregarDados(ws As Worksheet)
    Dim ult As Long, ultCol As Long
    ult = ws.Cells(ws.Rows.Count, cPEP).End(xlUp).Row
    If ult < 2 Then
        ReDim dados(1 To 1, 1 To 1)
        nLin = 0
        Exit Sub
    End If

    ultCol = ws.Cells(1, ws.Columns.Count).End(xlToLeft).Column
    If ws.UsedRange.Column + ws.UsedRange.Columns.Count - 1 > ultCol Then
        ultCol = ws.UsedRange.Column + ws.UsedRange.Columns.Count - 1
    End If
    rawColCount = ultCol
    rawHeaders = ws.Range(ws.Cells(1, 1), ws.Cells(1, ultCol)).Value
    dados = ws.Range(ws.Cells(2, 1), ws.Cells(ult, ultCol)).Value
    nLin = 0
    Dim i As Long
    For i = 1 To UBound(dados, 1)
        If Trim$(CStr(dados(i, cPEP))) <> "" Then nLin = nLin + 1
    Next i
End Sub

Private Function ValorCampo(ByVal lin As Long, ByVal col As Long, Optional ByVal padrao As Variant = "") As Variant
    If col <= 0 Then
        ValorCampo = padrao
    ElseIf col > UBound(dados, 2) Then
        ValorCampo = padrao
    Else
        ValorCampo = dados(lin, col)
    End If
End Function

Private Function TextoCampo(ByVal lin As Long, ByVal col As Long, Optional ByVal padrao As String = "") As String
    TextoCampo = Trim$(CStr(ValorCampo(lin, col, padrao)))
End Function

Private Function ValorMatriz(m As Variant, ByVal lin As Long, ByVal col As Long, Optional ByVal padrao As Variant = "") As Variant
    If col <= 0 Then
        ValorMatriz = padrao
    ElseIf col > UBound(m, 2) Then
        ValorMatriz = padrao
    Else
        ValorMatriz = m(lin, col)
    End If
End Function

Private Function TextoMatriz(m As Variant, ByVal lin As Long, ByVal col As Long, Optional ByVal padrao As String = "") As String
    TextoMatriz = Trim$(CStr(ValorMatriz(m, lin, col, padrao)))
End Function

Private Function LinhaCLS1(ByVal lin As Long) As String
    LinhaCLS1 = TextoCampo(lin, cCLS1Raw)
End Function

Private Function LinhaCLS2(ByVal lin As Long) As String
    LinhaCLS2 = TextoCampo(lin, cCLS2Raw)
End Function

Private Function LinhaCLS3(ByVal lin As Long) As String
    LinhaCLS3 = TextoCampo(lin, cCLS3Raw)
End Function

Private Function LinhaTipoAplic(ByVal lin As Long) As String
    LinhaTipoAplic = TextoCampo(lin, cTipoAplicRaw)
End Function

Private Function MatInfoLinha(ByVal lin As Long, ByVal idx As Long) As String
    MatInfoLinha = CatInfo(dados(lin, cMaterial), idx)
    If MatInfoLinha <> "" Then Exit Function

    Select Case idx
        Case 0: MatInfoLinha = "(SEM FAMILIA)"
        Case 1: MatInfoLinha = LinhaCLS1(lin)
        Case 2: MatInfoLinha = LinhaCLS2(lin)
        Case 3: MatInfoLinha = LinhaCLS3(lin)
    End Select
End Function

Private Function SrvInfoLinha(ByVal lin As Long, ByVal idx As Long) As String
    SrvInfoLinha = SrvInfo(dados(lin, cMaterial), idx)
    If SrvInfoLinha <> "" Then Exit Function

    Select Case idx
        Case 0: SrvInfoLinha = LinhaCLS1(lin)
        Case 1: SrvInfoLinha = LinhaCLS2(lin)
        Case 2: SrvInfoLinha = LinhaCLS3(lin)
        Case 3: SrvInfoLinha = LinhaTipoAplic(lin)
    End Select
End Function

Private Function TipoPEPCodigo(ByVal pep As String) As String
    Select Case UCase$(Right$(Trim$(pep), 2))
        Case ".I": TipoPEPCodigo = "I"
        Case ".D": TipoPEPCodigo = "D"
        Case ".M": TipoPEPCodigo = "M"
        Case Else: TipoPEPCodigo = "S"
    End Select
End Function

Private Function TipoPEPANEEL(ByVal pep As String) As String
    Select Case TipoPEPCodigo(pep)
        Case "I": TipoPEPANEEL = "ODI"
        Case "D": TipoPEPANEEL = "ODD"
        Case "M": TipoPEPANEEL = "ODM"
        Case Else: TipoPEPANEEL = "OUTRO"
    End Select
End Function

Private Function SituacaoQtdValor(q As Double, val As Double) As String
    If q > 0 And val > 0 Then
        SituacaoQtdValor = "QTD POSITIVA/VLR POSITIVO"
    ElseIf q < 0 And val < 0 Then
        SituacaoQtdValor = "QTD NEGATIVA/VLR NEGATIVO"
    ElseIf q = 0 And val = 0 Then
        SituacaoQtdValor = "QTD ZERO/VLR ZERO"
    ElseIf q = 0 Then
        SituacaoQtdValor = "QTD ZERO/VLR DIF ZERO"
    ElseIf val = 0 Then
        SituacaoQtdValor = "QTD DIF ZERO/VLR ZERO"
    Else
        SituacaoQtdValor = "SINAIS DIVERGENTES"
    End If
End Function

Private Function ClassificacaoPendente(ByVal cls1 As String, ByVal cls2 As String, ByVal cls3 As String) As Boolean
    Dim s1 As String, s2 As String, s3 As String
    s1 = UCase$(SemAcento(Trim$(cls1)))
    s2 = UCase$(SemAcento(Trim$(cls2)))
    s3 = UCase$(SemAcento(Trim$(cls3)))
    ClassificacaoPendente = (s3 = "" Or s3 = "CLASSIFICAR" Or s2 = "CLASSIFICAR" Or s1 = "CLASSIFICAR")
End Function


'==============================================================================
'  CATLOGO DE MATERIAIS (FAMILIA, CLS1, CLS2, CLS3)
'==============================================================================
Private Sub CarregarCatalogoMateriais()
    Set dCatMat = CreateObject("Scripting.Dictionary")

    ' 1) Tenta o caminho padro em Downloads
    Dim caminho As String
    caminho = Environ$("USERPROFILE") & "\Downloads\MATERIAS_ATUAIS (2).xlsx"
    If Dir(caminho) = "" Then caminho = Environ$("USERPROFILE") & "\Downloads\MATERIAS_ATUAIS.xlsx"

    ' 2) Se no achar, pede para o usurio selecionar
    If Dir(caminho) = "" Then
        Dim f As Variant
        f = Application.GetOpenFilename( _
            "Excel (*.xls*),*.xls*", , _
            "Selecione o catalogo de MATERIAIS (MATERIAS_ATUAIS). Cancele para pular.")
        If f = False Then Exit Sub   ' usurio cancelou -> segue sem catlogo
        caminho = CStr(f)
    End If

    On Error GoTo SemCat
    Dim wb As Workbook, ws As Worksheet, arr As Variant
    Set wb = Workbooks.Open(caminho, ReadOnly:=True, UpdateLinks:=0)
    Set ws = wb.Worksheets(1)

    Dim cCod As Long, cFam As Long, c1 As Long, c2 As Long, c3 As Long
    cCod = ColLike(ws, Array("COD MATERIAL", "COD_MATERIAL", "MATERIAL"))
    cFam = ColLike(ws, Array("FAMILIA"))
    c1 = ColLike(ws, Array("CLS1"))
    c2 = ColLike(ws, Array("CLS2"))
    c3 = ColLike(ws, Array("CLS3"))
    If cCod = 0 Then wb.Close SaveChanges:=False: Exit Sub

    Dim ult As Long
    ult = ws.Cells(ws.Rows.Count, cCod).End(xlUp).Row
    arr = ws.Range(ws.Cells(2, 1), ws.Cells(ult, ws.UsedRange.Columns.Count)).Value

    Dim i As Long, cod As String, fam As String, v1 As String, v2 As String, v3 As String
    For i = 1 To UBound(arr, 1)
        cod = NormCod(arr(i, cCod))
        If cod <> "" And Not dCatMat.Exists(cod) Then
            fam = TextoMatriz(arr, i, cFam)
            v1 = TextoMatriz(arr, i, c1)
            v2 = TextoMatriz(arr, i, c2)
            v3 = TextoMatriz(arr, i, c3)
            dCatMat(cod) = fam & "|" & v1 & "|" & v2 & "|" & v3
        End If
    Next i
    wb.Close SaveChanges:=False
    Exit Sub
SemCat:
    On Error Resume Next
    If Not wb Is Nothing Then wb.Close SaveChanges:=False
End Sub

' Normaliza cdigo de material para casar base x catlogo
Private Function NormCod(v As Variant) As String
    If IsNumeric(v) Then
        Dim d As Double: d = CDbl(v)
        If d = Int(d) Then NormCod = Format$(d, "0") Else NormCod = CStr(d)
    Else
        NormCod = Trim$(CStr(v))
    End If
End Function

' Devolve parte do catlogo: 0=FAMILIA, 1=CLS1, 2=CLS2, 3=CLS3
Private Function CatInfo(codMat As Variant, idx As Long) As String
    CatInfo = ""
    If dCatMat Is Nothing Then Exit Function
    Dim cod As String: cod = NormCod(codMat)
    If dCatMat.Exists(cod) Then
        Dim p() As String: p = Split(dCatMat(cod), "|")
        If idx <= UBound(p) Then CatInfo = Trim$(p(idx))
    End If
End Function

' Famlia com rtulo padro quando vazia
Private Function CatFamilia(codMat As Variant) As String
    Dim fam As String: fam = CatInfo(codMat, 0)
    If fam = "" Then CatFamilia = "(SEM FAMILIA)" Else CatFamilia = fam
End Function


'==============================================================================
'  CATLOGO DE SERVIOS (CLS1, CLS2, CLS3, TIPO_APLIC, SEGMENTO)
'  Nas linhas de servio (CA), o cdigo do servio est na coluna "Material".
'==============================================================================
Private Sub CarregarCatalogoServicos()
    Set dCatSrv = CreateObject("Scripting.Dictionary")

    Dim caminho As String
    caminho = Environ$("USERPROFILE") & "\Downloads\SERVICOS_ATUAIS.xlsx"
    If Dir(caminho) = "" Then
        Dim f As Variant
        f = Application.GetOpenFilename( _
            "Excel (*.xls*),*.xls*", , _
            "Selecione o catalogo de SERVICOS (SERVICOS_ATUAIS). Cancele para pular.")
        If f = False Then Exit Sub
        caminho = CStr(f)
    End If

    On Error GoTo SemCat
    Dim wb As Workbook, ws As Worksheet, arr As Variant
    Set wb = Workbooks.Open(caminho, ReadOnly:=True, UpdateLinks:=0)
    Set ws = wb.Worksheets(1)

    Dim cCod As Long, c1 As Long, c2 As Long, c3 As Long, cTA As Long, cSeg As Long
    cCod = ColLike(ws, Array("COD SERVICO", "COD_SERVICO", "SERVICO"))
    c1 = ColLike(ws, Array("CLS1"))
    c2 = ColLike(ws, Array("CLS2"))
    c3 = ColLike(ws, Array("CLS3"))
    cTA = ColLike(ws, Array("TIPO APLICACAO", "TIPO_APLICACAO", "TIPO APLIC"))
    cSeg = ColLike(ws, Array("SEGMENTO"))
    If cCod = 0 Then wb.Close SaveChanges:=False: Exit Sub

    Dim ult As Long
    ult = ws.Cells(ws.Rows.Count, cCod).End(xlUp).Row
    arr = ws.Range(ws.Cells(2, 1), ws.Cells(ult, ws.UsedRange.Columns.Count)).Value

    Dim i As Long, cod As String
    For i = 1 To UBound(arr, 1)
        cod = NormCod(arr(i, cCod))
        If cod <> "" And Not dCatSrv.Exists(cod) Then
            dCatSrv(cod) = _
                TextoMatriz(arr, i, c1) & "|" & _
                TextoMatriz(arr, i, c2) & "|" & _
                TextoMatriz(arr, i, c3) & "|" & _
                TextoMatriz(arr, i, cTA) & "|" & _
                TextoMatriz(arr, i, cSeg)
        End If
    Next i
    wb.Close SaveChanges:=False
    Exit Sub
SemCat:
    On Error Resume Next
    If Not wb Is Nothing Then wb.Close SaveChanges:=False
End Sub

' Devolve parte do catlogo de servio: 0=CLS1,1=CLS2,2=CLS3,3=TIPO_APLIC,4=SEGMENTO
Private Function SrvInfo(codSrv As Variant, idx As Long) As String
    SrvInfo = ""
    If dCatSrv Is Nothing Then Exit Function
    Dim cod As String: cod = NormCod(codSrv)
    If dCatSrv.Exists(cod) Then
        Dim p() As String: p = Split(dCatSrv(cod), "|")
        If idx <= UBound(p) Then SrvInfo = Trim$(p(idx))
    End If
End Function


'==============================================================================
'  CATLOGO DE CLASSE DE CUSTO (CLS1, CLS2, CLS3, TIPO_APLIC)
'  Usado para a aba RISCO: classes cujo CLS3 = "RISCO".
'==============================================================================
Private Sub CarregarCatalogoClasse()
    Set dCatCC = CreateObject("Scripting.Dictionary")
    CarregarClassificacaoClassesDados

    Dim caminho As String
    caminho = Environ$("USERPROFILE") & "\Downloads\CLASSE_CUSTO_ATUAIS.xlsx"
    If Dir(caminho) = "" Then caminho = Environ$("USERPROFILE") & "\Downloads\CLASSE_CUSTO_ATUAIS (1).xlsx"
    If Dir(caminho) = "" Then
        Dim f As Variant
        f = Application.GetOpenFilename( _
            "Excel (*.xls*),*.xls*", , _
            "Selecione o catalogo de CLASSE DE CUSTO (CLASSE_CUSTO_ATUAIS). Cancele para pular.")
        If f = False Then Exit Sub
        caminho = CStr(f)
    End If

    On Error GoTo SemCat
    Dim wb As Workbook, ws As Worksheet, arr As Variant
    Set wb = Workbooks.Open(caminho, ReadOnly:=True, UpdateLinks:=0)
    Set ws = wb.Worksheets(1)

    Dim cCod As Long, c1 As Long, c2 As Long, c3 As Long, cTA As Long
    cCod = ColLike(ws, Array("CLASSE CUSTO", "CLASSE_CUSTO", "CLASSE DE CUSTO"))
    c1 = ColLike(ws, Array("CLS1"))
    c2 = ColLike(ws, Array("CLS2"))
    c3 = ColLike(ws, Array("CLS3"))
    cTA = ColLike(ws, Array("TIPO APLICACAO", "TIPO_APLICACAO", "TIPO APLIC"))
    If cCod = 0 Then wb.Close SaveChanges:=False: Exit Sub

    Dim ult As Long
    ult = ws.Cells(ws.Rows.Count, cCod).End(xlUp).Row
    arr = ws.Range(ws.Cells(2, 1), ws.Cells(ult, ws.UsedRange.Columns.Count)).Value

    Dim i As Long, cod As String
    For i = 1 To UBound(arr, 1)
        cod = NormCod(arr(i, cCod))
        If cod <> "" And Not dCatCC.Exists(cod) Then
            dCatCC(cod) = _
                TextoMatriz(arr, i, c1) & "|" & _
                TextoMatriz(arr, i, c2) & "|" & _
                TextoMatriz(arr, i, c3) & "|" & _
                TextoMatriz(arr, i, cTA)
        End If
    Next i
    wb.Close SaveChanges:=False
    Exit Sub
SemCat:
    On Error Resume Next
    If Not wb Is Nothing Then wb.Close SaveChanges:=False
End Sub

Private Sub CarregarClassificacaoClassesDados()
    ' Tabela oficial recebida em dados.xlsx: CLASSE DE CUSTO -> CLS1/CLS2/CLS3.
    ' Ela fica embutida para que a ANALISE DE CA classifique MOP, tributos,
    ' suporte, publicidade, frete e JOA mesmo sem arquivo externo.
    AddClasseCusto "8010270000", "OUTROS", "MOP", "MOP"
    AddClasseCusto "8110270000", "OUTROS", "MOP", "MOP"
    AddClasseCusto "8210270000", "OUTROS", "MOP", "MOP"
    AddClasseCusto "8990270000", "OUTROS", "MOP", "MOP"
    AddClasseCusto "8210520000", "SERVICO", "FRETE/TRANSP", "FRETE/TRANSP"
    AddClasseCusto "8999080000", "OUTROS", "OUTROS", "JOA"
    AddClasseCusto "8930010000", "OUTROS", "OUTROS", "TRIBUTOS"
    AddClasseCusto "8019930000", "OUTROS", "MOP", "MOP"
    AddClasseCusto "8119020000", "OUTROS", "ODC_MATERIAL", "TRIBUTOS"
    AddClasseCusto "8110980000", "OUTROS", "OUTROS", "TRIBUTOS"
    AddClasseCusto "8010280000", "OUTROS", "MOP", "MOP"
    AddClasseCusto "8110280000", "OUTROS", "MOP", "MOP"
    AddClasseCusto "8210280000", "OUTROS", "MOP", "MOP"
    AddClasseCusto "8990280000", "OUTROS", "MOP", "MOP"
    AddClasseCusto "8010260000", "OUTROS", "MOP", "MOP"
    AddClasseCusto "8110260000", "OUTROS", "MOP", "MOP"
    AddClasseCusto "8210260000", "OUTROS", "MOP", "MOP"
    AddClasseCusto "8990260000", "OUTROS", "MOP", "MOP"
    AddClasseCusto "8111290000", "OUTROS", "ALIMENTACAO", "SUPORTE"
    AddClasseCusto "8119980000", "OUTROS", "CC_MATERIAL", "OUTROS"
    AddClasseCusto "8210550000", "OUTROS", "HOSPEDAGEM", "SUPORTE"
    AddClasseCusto "8210390000", "OUTROS", "PASSAGEM", "SUPORTE"
    AddClasseCusto "8210400000", "OUTROS", "MOBILIDADE", "SUPORTE"
    AddClasseCusto "8210490000", "OUTROS", "PUBLICIDADE", "PUBLICIDADE"
End Sub

Private Sub AddClasseCusto(ByVal cod As String, ByVal cls1 As String, ByVal cls2 As String, ByVal cls3 As String)
    If dCatCC Is Nothing Then Set dCatCC = CreateObject("Scripting.Dictionary")
    dCatCC(NormCod(cod)) = cls1 & "|" & cls2 & "|" & cls3 & "|"
End Sub

' Devolve parte do catlogo de classe: 0=CLS1,1=CLS2,2=CLS3,3=TIPO_APLIC
Private Function CCInfo(codCC As Variant, idx As Long) As String
    CCInfo = ""
    If dCatCC Is Nothing Then Exit Function
    Dim cod As String: cod = NormCod(codCC)
    If dCatCC.Exists(cod) Then
        Dim p() As String: p = Split(dCatCC(cod), "|")
        If idx <= UBound(p) Then CCInfo = Trim$(p(idx))
    End If
End Function


'==============================================================================
'  CONVERSAO DE CABO (KG -> METROS)   [ajuste fino da aderncia]
'  Cabos so lanados em KG; o servio mede em METROS. Converte:
'     metros = kg * FATOR   (FATOR = metros por kg, do catlogo)
'==============================================================================
Private Sub CarregarConversoesCabo()
    Set dCabo = CreateObject("Scripting.Dictionary")

    Dim caminho As String
    caminho = Environ$("USERPROFILE") & "\Downloads\CONVERSOES_CABO_ATUAIS.xlsx"
    If Dir(caminho) = "" Then Exit Sub   ' opcional: sem arquivo, segue sem converter

    On Error GoTo SemCat
    Dim wb As Workbook, ws As Worksheet, arr As Variant
    Set wb = Workbooks.Open(caminho, ReadOnly:=True, UpdateLinks:=0)
    Set ws = wb.Worksheets(1)

    Dim cCod As Long, cFat As Long
    cCod = ColLike(ws, Array("COD MATERIAL", "COD_MATERIAL", "MATERIAL"))
    cFat = ColLike(ws, Array("FATOR"))
    If cCod = 0 Or cFat = 0 Then wb.Close SaveChanges:=False: Exit Sub

    Dim ult As Long
    ult = ws.Cells(ws.Rows.Count, cCod).End(xlUp).Row
    arr = ws.Range(ws.Cells(2, 1), ws.Cells(ult, ws.UsedRange.Columns.Count)).Value

    Dim i As Long, cod As String, f As Double
    For i = 1 To UBound(arr, 1)
        cod = NormCod(arr(i, cCod))
        f = ToNum(arr(i, cFat))
        If cod <> "" And f > 0 And Not dCabo.Exists(cod) Then dCabo(cod) = f
    Next i
    wb.Close SaveChanges:=False
    Exit Sub
SemCat:
    On Error Resume Next
    If Not wb Is Nothing Then wb.Close SaveChanges:=False
End Sub

' Fator de converso do material (0 = sem converso)
Private Function CaboFator(codMat As Variant) As Double
    CaboFator = 0
    If dCabo Is Nothing Then Exit Function
    Dim cod As String: cod = NormCod(codMat)
    If dCabo.Exists(cod) Then CaboFator = dCabo(cod)
End Function


'==============================================================================
'  SRV COMBO (FATOR MULTIPLICADOR DE SERVIO)   [ajuste fino da aderncia]
'  Alguns servios instalam vrias unidades (ex.: "cruzeta dupla" = 2) ou so
'  medidos em KM (fator 1000). A QTD do servio  multiplicada pelo FATOR para
'  bater com a QTD de material instalado.
'==============================================================================
Private Sub CarregarComboServico()
    Set dCombo = CreateObject("Scripting.Dictionary")

    Dim caminho As String
    caminho = Environ$("USERPROFILE") & "\Downloads\SRV_COMBO_ATUAIS.xlsx"
    If Dir(caminho) = "" Then
        Dim f0 As Variant
        f0 = Application.GetOpenFilename( _
            "Excel (*.xls*),*.xls*", , _
            "Selecione o catalogo SRV COMBO (SRV_COMBO_ATUAIS). Cancele para pular.")
        If f0 = False Then Exit Sub
        caminho = CStr(f0)
    End If

    On Error GoTo SemCat
    Dim wb As Workbook, ws As Worksheet, arr As Variant
    Set wb = Workbooks.Open(caminho, ReadOnly:=True, UpdateLinks:=0)
    Set ws = wb.Worksheets(1)

    Dim cCod As Long, cFat As Long
    cCod = ColLike(ws, Array("SRV_PRINCIPAL", "SRV PRINCIPAL", "COD SERVICO", "SERVICO"))
    cFat = ColLike(ws, Array("FATOR"))
    If cCod = 0 Or cFat = 0 Then wb.Close SaveChanges:=False: Exit Sub

    Dim ult As Long
    ult = ws.Cells(ws.Rows.Count, cCod).End(xlUp).Row
    arr = ws.Range(ws.Cells(2, 1), ws.Cells(ult, ws.UsedRange.Columns.Count)).Value

    Dim i As Long, cod As String, f As Double
    For i = 1 To UBound(arr, 1)
        cod = NormCod(arr(i, cCod))
        f = ToNum(arr(i, cFat))
        If cod <> "" And f > 0 And Not dCombo.Exists(cod) Then dCombo(cod) = f
    Next i
    wb.Close SaveChanges:=False
    Exit Sub
SemCat:
    On Error Resume Next
    If Not wb Is Nothing Then wb.Close SaveChanges:=False
End Sub

' Fator multiplicador do servio (1 = sem multiplicador)
Private Function ComboFator(codSrv As Variant) As Double
    ComboFator = 1
    If dCombo Is Nothing Then Exit Function
    Dim cod As String: cod = NormCod(codSrv)
    If dCombo.Exists(cod) Then ComboFator = dCombo(cod)
End Function


'==============================================================================
'  PRECO UNITARIO - FAIXAS MIN/MAX
'  Usa primeiro uma aba existente PRECO UNITARIO/PRECO UNITARIO no arquivo ativo.
'  Se nao existir, tenta arquivos de referencia em Downloads e permite selecionar.
'==============================================================================
Private Sub CarregarPrecoReferencia()
    Set dPU = CreateObject("Scripting.Dictionary")

    Dim ws As Worksheet
    For Each ws In ActiveWorkbook.Worksheets
        If UCase$(SemAcento(ws.Name)) = "PRECO UNITARIO" Or UCase$(SemAcento(ws.Name)) = "PRECO UNITARIO" Then
            CarregarPrecoDePlanilha ws
            If dPU.Count > 0 Then Exit Sub
        End If
    Next ws

    Dim caminho As String
    caminho = Environ$("USERPROFILE") & "\Downloads\PRECO_UNITARIO_ATUAIS.xlsx"
    If Dir(caminho) = "" Then caminho = Environ$("USERPROFILE") & "\Downloads\PU_MATERIAIS_ATUAIS.xlsx"
    If Dir(caminho) = "" Then caminho = Environ$("USERPROFILE") & "\Downloads\PRECO_UNITARIO.xlsx"

    If Dir(caminho) = "" Then
        Dim f As Variant
        f = Application.GetOpenFilename( _
            "Excel (*.xls*),*.xls*", , _
            "Selecione uma referencia de PRECO UNITARIO com MATERIAL, MIN PU e MAX PU. Cancele para pular.")
        If f = False Then Exit Sub
        caminho = CStr(f)
    End If

    On Error GoTo SemRef
    Dim wb As Workbook
    Set wb = Workbooks.Open(caminho, ReadOnly:=True, UpdateLinks:=0)
    CarregarPrecoDePlanilha wb.Worksheets(1)
    wb.Close SaveChanges:=False
    Exit Sub
SemRef:
    On Error Resume Next
    If Not wb Is Nothing Then wb.Close SaveChanges:=False
End Sub

Private Sub CarregarPrecoDePlanilha(ws As Worksheet)
    Dim cCod As Long, cMin As Long, cMax As Long
    cCod = ColLike(ws, Array("MATERIAL", "COD MATERIAL", "COD_MATERIAL"))
    cMin = ColLike(ws, Array("MIN PU", "PRECO MIN", "PRECO_MIN", "VALOR MIN"))
    cMax = ColLike(ws, Array("MAX PU", "PRECO MAX", "PRECO_MAX", "VALOR MAX"))
    If cCod = 0 Or cMin = 0 Or cMax = 0 Then Exit Sub

    Dim ult As Long, arr As Variant
    ult = ws.Cells(ws.Rows.Count, cCod).End(xlUp).Row
    If ult < 2 Then Exit Sub
    arr = ws.Range(ws.Cells(2, 1), ws.Cells(ult, ws.Cells(1, ws.Columns.Count).End(xlToLeft).Column)).Value

    Dim i As Long, cod As String, mn As Double, mx As Double
    For i = 1 To UBound(arr, 1)
        cod = NormCod(arr(i, cCod))
        mn = ToNum(arr(i, cMin))
        mx = ToNum(arr(i, cMax))
        If cod <> "" And mx > 0 And Not dPU.Exists(cod) Then dPU(cod) = CStr(mn) & "|" & CStr(mx)
    Next i
End Sub

Private Function PUInfo(codMat As Variant, idx As Long) As Double
    PUInfo = 0
    If dPU Is Nothing Then Exit Function
    Dim cod As String: cod = NormCod(codMat)
    If dPU.Exists(cod) Then
        Dim p() As String: p = Split(dPU(cod), "|")
        If idx <= UBound(p) Then PUInfo = ToNum(p(idx))
    End If
End Function


'==============================================================================
'  DE-PARA: CLASSIFICACAO (familia/CLS2) -> TIPO (COM / UC / UAR)
'  Mapeamento fixo (de Pasta5). Onde a mesma familia aparece com TIPO diferente,
'  vale o PRIMEIRO (comportamento de PROCV). Comparacao ignora acento/maiusc.
'==============================================================================
Private Sub CarregarTipoClassif()
    Set dTipoCls = CreateObject("Scripting.Dictionary")
    Dim s As String
    s = "CRUZETA=COM;COM_MAT_SERV=COM;PARA RAIO BT=COM;PARA RAIO MT=COM;POSTE RD=UC;" & _
        "SUPORTE MET=COM;CH FUS=COM;ISOLADOR PINO MT=COM;PINO=COM;TRAFO=UC;COND NU=UC;" & _
        "ISOLADOR BT=COM;ALCA=COM;PLACA ID=COM;CABO ISOLADO=UC;ELETRODUTO=COM;HASTE ATERR=COM;" & _
        "MAO FRANCESA=COM;COND COBRE=UC;SUPORTE TRAFO=COM;COND ISOLADO=UC;CINTA POSTE=COM;" & _
        "RAMAL=UC;COND PROT=UC;CH SU FACA=UC;CORDOALHA=COM;ISOLADOR ANC MT=COM;EMENDA=COM;" & _
        "ESPACADOR LOSAG=COM;PROTETOR RETICUL=UC;SUPORTE=COM;RELIGADOR=UC;POSTE PDR ACO=UC;" & _
        "TERMINAL ANEL/OLHAL=COM;CABO COBRE=COM;TC_COM=COM;MEDIDOR_FISCAL=UC;TERMINAL ILHOS=COM;" & _
        "CH AFER=COM;CAIXA PDR=COM;CAIXA_TC=COM;CABO CONTROLE=COM;PLACA ADVERT=COM;TERMINAL COND=COM;" & _
        "DUTO=COM;CX DISPLAY SMC=COM;CP_CS_MD=UAR;TER_LEITURA=UAR;MEDIDOR=UC;REGULADOR=UC;" & _
        "CH FUS RELIG=UC;HASTE ANCORA ESTAI=COM;TP_TC=UC;ISOLADOR ESPACADOR=COM;VIGA MET=COM;" & _
        "CABO NU=COM;BLOCO CONC ESTAI=COM;GRAXA (ANE)=COM;LUBRIFICANTE=COM;MUFLA=COM;" & _
        "PAINEL CONTR EXAUSTOR=UAR;TERMINAL BIMETALICO=COM;BOMBA SUBM=UAR;EXAUSTOR=COM;" & _
        "TAMPA DE FERRO=COM;ESPACADOR=COM;RELE=UAR;TERMINAL CABO=COM;CANALETA=COM;CH VAC 1F=UC;" & _
        "POSTE CAPITEL=UC;TORA EUCALIPTO=COM;CAIXA DE PASSAGEM=COM;POSTE LD=UC;CAPACITOR=UC;" & _
        "CONTROLADOR=UAR;MURO CONC=UC;GRAMPO=COM;DISJ BT=COM;PORTA FUSIVEL=COM"

    Dim parts() As String, kv() As String, i As Long, key As String
    parts = Split(s, ";")
    For i = 0 To UBound(parts)
        kv = Split(parts(i), "=")
        If UBound(kv) >= 1 Then
            key = NormClassif(kv(0))
            If key <> "" And Not dTipoCls.Exists(key) Then dTipoCls(key) = Trim$(kv(1))
        End If
    Next i
End Sub

' Normaliza familia/classificacao p/ casar: maiusc, sem acento, espacos colapsados
Private Function NormClassif(ByVal s As String) As String
    s = UCase$(SemAcento(Trim$(CStr(s))))
    Do While InStr(s, "  ") > 0
        s = Replace(s, "  ", " ")
    Loop
    NormClassif = s
End Function

' TIPO (COM/UC/UAR) a partir da CLASSIFICACAO (familia/CLS2)
Private Function TipoDaClassif(ByVal classif As String) As String
    TipoDaClassif = ""
    If dTipoCls Is Nothing Then Exit Function
    Dim k As String: k = NormClassif(classif)
    If dTipoCls.Exists(k) Then TipoDaClassif = dTipoCls(k)
End Function

' Unifica familias equivalentes para a aderencia MATERIAL vs SERVICO.
' COND ISOLADO e COND ISOLADO/PROT sao atrelados a COND PROT.
Private Function FamiliaAlias(ByVal cls2 As String) As String
    Select Case NormClassif(cls2)
        Case "COND ISOLADO/PROT", "COND ISOLADO": FamiliaAlias = "COND PROT"
        Case Else: FamiliaAlias = cls2
    End Select
End Function

' Familia de cabo/condutor (para a regra do RAMAL cobrir o cabo)
Private Function EhCabo(ByVal cls2 As String) As Boolean
    Dim s As String: s = NormClassif(cls2)
    EhCabo = (Left$(s, 5) = "COND " Or Left$(s, 5) = "CABO " _
              Or s = "RAMAL")
End Function

' Aderencia com margem de 10% (para mais ou para menos), por magnitude.
Private Function DentroMargem(ByVal a As Double, ByVal b As Double) As Boolean
    Dim x As Double, y As Double, base As Double
    x = Abs(a): y = Abs(b)
    base = x: If y > base Then base = y
    If base = 0 Then
        DentroMargem = True            ' ambos zero
    Else
        DentroMargem = (Abs(x - y) <= 0.1 * base)
    End If
End Function


'==============================================================================
'  FUNES AUXILIARES (derivaes)
'==============================================================================
Private Function PEP3(ByVal pep As String) As String
    Dim s As String: s = UCase$(Right$(pep, 2))
    If s = ".I" Or s = ".D" Or s = ".M" Then
        PEP3 = Left$(pep, Len(pep) - 2)
    Else
        PEP3 = pep
    End If
End Function

Private Function TipoPEP(ByVal pep As String) As String
    ' TIPO_PEP reclassificado em cdigo curto: I / D / M / S
    Select Case UCase$(Right$(pep, 2))
        Case ".I": TipoPEP = "I"
        Case ".D": TipoPEP = "D"
        Case ".M": TipoPEP = "M"
        Case Else: TipoPEP = "S"
    End Select
End Function

' Cdigo de segmento da regional (3 letras aps "RS-"+7 dgitos). Ex: ...UNR...
Private Function SegmentoPI(ByVal pep As String) As String
    Dim s As String: s = Trim$(pep)
    If Len(s) >= 13 Then
        Dim seg As String: seg = Mid$(s, 11, 3)
        If seg Like "[A-Za-z][A-Za-z][A-Za-z]" Then SegmentoPI = UCase$(seg): Exit Function
    End If
    SegmentoPI = ""
End Function

Private Function GrupoPerc(ByVal pep As String) As String
    Dim u As String: u = UCase$(pep)
    If InStr(u, "EME") > 0 Or InStr(u, "EMM") > 0 Then
        GrupoPerc = "EME/EMM (8%)"
    Else
        GrupoPerc = "OUTROS (25%)"
    End If
End Function

Private Function EhMaterial(ByVal classif As String) As Boolean
    Dim c As String: c = UCase$(Trim$(classif))
    EhMaterial = (c = "UC" Or c = "COM" Or c = "UAR" Or InStr(c, "FALTA") > 0)
End Function

Private Function ToNum(v As Variant) As Double
    If IsNumeric(v) Then ToNum = CDbl(v) Else ToNum = 0
End Function


'==============================================================================
'  ABA: RAZAO CJ  (base enriquecida com classificacoes usadas nas analises)
'==============================================================================
Private Sub Gerar_RazaoCJ()
    Dim extra As Long
    extra = 0
    If cCLS1Raw = 0 Then extra = extra + 1
    If cCLS2Raw = 0 Then extra = extra + 1
    If cCLS3Raw = 0 Then extra = extra + 1
    If cTipoAplicRaw = 0 Then extra = extra + 1

    Dim outp() As Variant: ReDim outp(0 To nLin, 1 To rawColCount + extra)
    Dim j As Long, outCol As Long
    For j = 1 To rawColCount
        outp(0, j) = rawHeaders(1, j)
    Next j

    outCol = rawColCount
    If cCLS1Raw = 0 Then outCol = outCol + 1: outp(0, outCol) = "CLS1"
    If cCLS2Raw = 0 Then outCol = outCol + 1: outp(0, outCol) = "CLS2"
    If cCLS3Raw = 0 Then outCol = outCol + 1: outp(0, outCol) = "CLS3"
    If cTipoAplicRaw = 0 Then outCol = outCol + 1: outp(0, outCol) = "TIPO_APLICACAO"

    Dim i As Long, r As Long, cls1 As String, cls2 As String, cls3 As String, ta As String
    For i = 1 To UBound(dados, 1)
        If Trim$(CStr(dados(i, cPEP))) = "" Then GoTo Prox
        r = r + 1
        For j = 1 To rawColCount
            outp(r, j) = dados(i, j)
        Next j

        If EhMaterial(CStr(dados(i, cClassif))) Then
            cls1 = MatInfoLinha(i, 1)
            cls2 = MatInfoLinha(i, 2)
            cls3 = MatInfoLinha(i, 3)
            ta = LinhaTipoAplic(i)
        Else
            cls1 = SrvInfoLinha(i, 0)
            cls2 = SrvInfoLinha(i, 1)
            cls3 = SrvInfoLinha(i, 2)
            ta = SrvInfoLinha(i, 3)
        End If

        outCol = rawColCount
        If cCLS1Raw = 0 Then outCol = outCol + 1: outp(r, outCol) = cls1
        If cCLS2Raw = 0 Then outCol = outCol + 1: outp(r, outCol) = cls2
        If cCLS3Raw = 0 Then outCol = outCol + 1: outp(r, outCol) = cls3
        If cTipoAplicRaw = 0 Then outCol = outCol + 1: outp(r, outCol) = ta
Prox:
    Next i

    EscreverAba "RAZAO CJ", outp
End Sub


'==============================================================================
'  ABA: PEND CLASSIFICACAO  (linhas que ainda exigem saneamento de catalogo)
'==============================================================================
Private Sub Gerar_PendClassificacao()
    Dim i As Long, n As Long, cls1 As String, cls2 As String, cls3 As String
    For i = 1 To UBound(dados, 1)
        If Trim$(CStr(dados(i, cPEP))) = "" Then GoTo C1
        If EhMaterial(CStr(dados(i, cClassif))) Then
            cls1 = MatInfoLinha(i, 1): cls2 = MatInfoLinha(i, 2): cls3 = MatInfoLinha(i, 3)
        Else
            cls1 = SrvInfoLinha(i, 0): cls2 = SrvInfoLinha(i, 1): cls3 = SrvInfoLinha(i, 2)
        End If
        If ClassificacaoPendente(cls1, cls2, cls3) Then n = n + 1
C1:
    Next i

    Dim outp() As Variant: ReDim outp(0 To n, 1 To rawColCount + 3)
    Dim j As Long
    For j = 1 To rawColCount
        outp(0, j) = rawHeaders(1, j)
    Next j
    outp(0, rawColCount + 1) = "CLS1_CALC"
    outp(0, rawColCount + 2) = "CLS2_CALC"
    outp(0, rawColCount + 3) = "CLS3_CALC"

    Dim r As Long
    For i = 1 To UBound(dados, 1)
        If Trim$(CStr(dados(i, cPEP))) = "" Then GoTo Prox
        If EhMaterial(CStr(dados(i, cClassif))) Then
            cls1 = MatInfoLinha(i, 1): cls2 = MatInfoLinha(i, 2): cls3 = MatInfoLinha(i, 3)
        Else
            cls1 = SrvInfoLinha(i, 0): cls2 = SrvInfoLinha(i, 1): cls3 = SrvInfoLinha(i, 2)
        End If
        If Not ClassificacaoPendente(cls1, cls2, cls3) Then GoTo Prox
        r = r + 1
        For j = 1 To rawColCount
            outp(r, j) = dados(i, j)
        Next j
        outp(r, rawColCount + 1) = cls1
        outp(r, rawColCount + 2) = cls2
        outp(r, rawColCount + 3) = cls3
Prox:
    Next i

    EscreverAba "PEND CLASSIFICACAO", outp
End Sub


'==============================================================================
'  ABA: RESUMO POR PEP  (pivot por classificao, 1 linha por PEP)
'==============================================================================
Private Sub Gerar_ResumoPorPEP()
    Dim dPEP As Object, dClassif As Object
    Set dPEP = CreateObject("Scripting.Dictionary")
    Set dClassif = CreateObject("Scripting.Dictionary")

    Dim somaPEPclas As Object: Set somaPEPclas = CreateObject("Scripting.Dictionary")
    Dim cntPEP As Object: Set cntPEP = CreateObject("Scripting.Dictionary")

    Dim i As Long, pep As String, cl As String, val As Double, k As String
    For i = 1 To UBound(dados, 1)
        pep = Trim$(CStr(dados(i, cPEP)))
        If pep = "" Then GoTo Prox
        cl = Trim$(CStr(dados(i, cClassif)))
        If cl = "" Then cl = "(SEM CLASSIF)"
        val = ToNum(dados(i, cValor))

        If Not dPEP.Exists(pep) Then dPEP.Add pep, dPEP.Count
        If Not dClassif.Exists(cl) Then dClassif.Add cl, dClassif.Count

        k = pep & "|" & cl
        somaPEPclas(k) = somaPEPclas(k) + val
        cntPEP(pep) = cntPEP(pep) + 1
Prox:
    Next i

    ' Monta matriz de sada
    Dim peps As Variant: peps = dPEP.Keys
    Dim clss As Variant: clss = dClassif.Keys
    Dim nC As Long: nC = dClassif.Count
    Dim outp() As Variant
    ReDim outp(0 To dPEP.Count, 1 To nC + 5)

    ' Cabealho
    outp(0, 1) = "PEP": outp(0, 2) = "TIPO_PEP": outp(0, 3) = "GRUPO_PERC"
    Dim j As Long
    For j = 0 To nC - 1
        outp(0, 4 + j) = "VALOR_" & UCase$(Replace(clss(j), " ", "_"))
    Next j
    outp(0, nC + 4) = "VALOR_TOTAL": outp(0, nC + 5) = "QTD_LANCAMENTOS"

    Dim r As Long, tot As Double
    For r = 0 To dPEP.Count - 1
        pep = peps(r)
        outp(r + 1, 1) = pep
        outp(r + 1, 2) = TipoPEP(pep)
        outp(r + 1, 3) = GrupoPerc(pep)
        tot = 0
        For j = 0 To nC - 1
            k = pep & "|" & clss(j)
            Dim v As Double: v = 0
            If somaPEPclas.Exists(k) Then v = somaPEPclas(k)
            outp(r + 1, 4 + j) = Round(v, 2)
            tot = tot + v
        Next j
        outp(r + 1, nC + 4) = Round(tot, 2)
        outp(r + 1, nC + 5) = cntPEP(pep)
    Next r

    EscreverAba "RESUMO POR PEP", outp
End Sub


'==============================================================================
'  ABA: CLASSIFICACAO  (distribuio geral)
'==============================================================================
Private Sub Gerar_Classificacao()
    Dim dSoma As Object, dCnt As Object
    Set dSoma = CreateObject("Scripting.Dictionary")
    Set dCnt = CreateObject("Scripting.Dictionary")
    Dim i As Long, cl As String, val As Double, tot As Double
    For i = 1 To UBound(dados, 1)
        If Trim$(CStr(dados(i, cPEP))) = "" Then GoTo Prox
        cl = Trim$(CStr(dados(i, cClassif))): If cl = "" Then cl = "(SEM CLASSIF)"
        val = ToNum(dados(i, cValor))
        dSoma(cl) = dSoma(cl) + val
        dCnt(cl) = dCnt(cl) + 1
        tot = tot + val
Prox:
    Next i

    Dim ks As Variant: ks = dSoma.Keys
    Dim outp() As Variant: ReDim outp(0 To dSoma.Count, 1 To 4)
    outp(0, 1) = "CLASSIFICACAO": outp(0, 2) = "LANCAMENTOS"
    outp(0, 3) = "VALOR_TOTAL": outp(0, 4) = "PCT_VALOR"
    Dim r As Long
    For r = 0 To dSoma.Count - 1
        outp(r + 1, 1) = ks(r)
        outp(r + 1, 2) = dCnt(ks(r))
        outp(r + 1, 3) = Round(dSoma(ks(r)), 2)
        If tot <> 0 Then outp(r + 1, 4) = Round(dSoma(ks(r)) / tot * 100, 2)
    Next r
    EscreverAba "CLASSIFICACAO", outp
End Sub


'==============================================================================
'  ABA: MATERIAL vs SERVIO  (aderncia por QUANTIDADE, por PEP + CLS2)
'  Lgica oficial: para cada PEP e cada classificao de famlia (CLS2),
'  soma a QTD de material (MAT) e a QTD de servio (SRV). Compara:
'     MAT = SRV  -> ADERENTE      (material instalado tem servio que o instale)
'     MAT <> SRV -> NAO ADERENTE  (sobra material sem servio, ou vice-versa)
'     ambos 0    -> NULO
'  O CLS2 vem do catlogo de MATERIAIS (linhas de material) e do catlogo de
'  SERVIOS (linhas de CA) - os dois usam o mesmo vocabulrio de famlia.
'==============================================================================
Private Sub Gerar_MaterialVsServico()
    Dim dMat As Object, dSrv As Object, dTA As Object, dKeys As Object
    Dim dNeg As Object
    Set dMat = CreateObject("Scripting.Dictionary")   ' PEP|CLS2 -> qtd material
    Set dSrv = CreateObject("Scripting.Dictionary")   ' PEP|CLS2 -> qtd servio
    Set dTA = CreateObject("Scripting.Dictionary")    ' PEP|CLS2 -> TIPO_APLICACAO
    Set dKeys = CreateObject("Scripting.Dictionary")  ' conjunto de chaves PEP|CLS2
    Set dNeg = CreateObject("Scripting.Dictionary")   ' marca chave com qtd negativa

    Dim i As Long, pep As String, cls2 As String, k As String, q As Double, ta As String
    Dim fat As Double
    For i = 1 To UBound(dados, 1)
        pep = Trim$(CStr(dados(i, cPEP))): If pep = "" Then GoTo Prox
        q = ToNum(dados(i, cQtd))
        If EhMaterial(CStr(dados(i, cClassif))) Then
            cls2 = MatInfoLinha(i, 2)                  ' CLS2 do catalogo/base enriquecida
            If cls2 = "" Then cls2 = "(SEM CLS2)"
            cls2 = FamiliaAlias(cls2)                  ' unifica familias equivalentes
            ' Ajuste fino: cabos em KG -> metros (metros = kg * fator)
            fat = CaboFator(dados(i, cMaterial))
            If fat > 0 Then q = q * fat
            k = pep & "|" & cls2
            dMat(k) = dMat(k) + q
            dKeys(k) = 1
            If q < 0 Then dNeg(k) = 1
        Else
            cls2 = SrvInfoLinha(i, 1)                  ' CLS2 do catalogo/base enriquecida
            If cls2 = "" Then cls2 = "(SEM CLS2)"
            cls2 = FamiliaAlias(cls2)                  ' unifica familias equivalentes
            ' Ajuste fino: SRV COMBO -> multiplica a qtd (cruzeta dupla=2, km*1000, ...)
            q = q * ComboFator(dados(i, cMaterial))
            k = pep & "|" & cls2
            dSrv(k) = dSrv(k) + q
            dKeys(k) = 1
            If q < 0 Then dNeg(k) = 1
            ta = SrvInfoLinha(i, 3)                    ' TIPO_APLICACAO do servio
            If ta <> "" And Not dTA.Exists(k) Then dTA(k) = ta
        End If
Prox:
    Next i

    Dim ks As Variant: ks = dKeys.Keys

    ' 1 passada: conta as chaves que NAO sao NULO (MAT=0 e SRV=0)
    ' -> linhas NULO nao entram no relatorio (a pedido)
    Dim r As Long, mqx As Double, sqx As Double, nKeep As Long
    For r = 0 To dKeys.Count - 1
        mqx = 0: If dMat.Exists(ks(r)) Then mqx = dMat(ks(r))
        sqx = 0: If dSrv.Exists(ks(r)) Then sqx = dSrv(ks(r))
        If Not (Round(mqx, 2) = 0 And Round(sqx, 2) = 0) Then nKeep = nKeep + 1
    Next r

    ' Veredito por PEP3: TODAS as familias UC (exceto cabos/condutores) com MAT=SRV?
    '   APROVADO = todas as familias UC consideradas tem MAT igual a SRV
    '   REPROVADO = pelo menos uma familia UC considerada tem MAT diferente de SRV
    '   Excluidas da regra: COND NU, COND COBRE, CABO ISOLADO, CORDOALHA, RAMAL
    ' Veredito calculado por PEP NIVEL 4 (PEP completo, com .I/.D), nao por PEP3.
    Dim dVerd As Object: Set dVerd = CreateObject("Scripting.Dictionary")
    Dim dUAR As Object: Set dUAR = CreateObject("Scripting.Dictionary")   ' PEP4 -> tem UAR
    Const EXCL_UC As String = "|COND NU|COND COBRE|CABO ISOLADO|CORDOALHA|RAMAL|"
    Dim pv As Variant, pep4v As String, clsv As String, mv As Double, sv As Double, tcv As String

    ' Regra do RAMAL: 1 ramal = 30 m. Se SRV(RAMAL)*30 cobrir (>=) o total de cabo
    ' do PEP4, os cabos/condutores desse PEP sao considerados aderentes.
    Dim dRamalM As Object: Set dRamalM = CreateObject("Scripting.Dictionary")
    Dim dCaboMat As Object: Set dCaboMat = CreateObject("Scripting.Dictionary")
    Dim cabCov As Object: Set cabCov = CreateObject("Scripting.Dictionary")
    For r = 0 To dKeys.Count - 1
        pv = Split(ks(r), "|")
        pep4v = CStr(pv(0)): clsv = CStr(pv(1))
        If NormClassif(clsv) = "RAMAL" Then
            sv = 0: If dSrv.Exists(ks(r)) Then sv = dSrv(ks(r))
            dRamalM(pep4v) = dRamalM(pep4v) + Abs(sv) * 30
        End If
        If EhCabo(clsv) Then
            mv = 0: If dMat.Exists(ks(r)) Then mv = dMat(ks(r))
            dCaboMat(pep4v) = dCaboMat(pep4v) + Abs(mv)
        End If
    Next r
    Dim pk As Variant
    For Each pk In dRamalM.Keys
        If dRamalM(pk) > 0 And dRamalM(pk) >= dCaboMat(pk) Then cabCov(pk) = 1
    Next pk

    For r = 0 To dKeys.Count - 1
        pv = Split(ks(r), "|")
        clsv = CStr(pv(1))
        pep4v = CStr(pv(0))                     ' PEP completo (nivel 4)
        tcv = UCase$(TipoDaClassif(clsv))
        If tcv = "UAR" Then dUAR(pep4v) = 1     ' PEP4 possui familia UAR
        If tcv = "UC" Then
            If InStr(EXCL_UC, "|" & NormClassif(clsv) & "|") = 0 Then
                If EhCabo(clsv) And cabCov.Exists(pep4v) Then
                    ' cabo coberto pelo ramal -> aderente
                    If Not dVerd.Exists(pep4v) Then dVerd(pep4v) = "APROVADO"
                Else
                    mv = 0: If dMat.Exists(ks(r)) Then mv = dMat(ks(r))
                    sv = 0: If dSrv.Exists(ks(r)) Then sv = dSrv(ks(r))
                    If Not dVerd.Exists(pep4v) Then dVerd(pep4v) = "APROVADO"
                    If Not DentroMargem(mv, sv) Then dVerd(pep4v) = "REPROVADO"
                End If
            End If
        End If
    Next r

    Dim outp() As Variant: ReDim outp(0 To nKeep, 1 To 13)
    outp(0, 1) = "STATUS_PEP4": outp(0, 2) = "PEP3NIVEL": outp(0, 3) = "PEP"
    outp(0, 4) = "CLASSIFICACAO": outp(0, 5) = "TIPO"
    outp(0, 6) = "MAT": outp(0, 7) = "SRV": outp(0, 8) = "DIFERENCA"
    outp(0, 9) = "SITUACAO": outp(0, 10) = "TIPO_PEP": outp(0, 11) = "PI"
    outp(0, 12) = "OBS1": outp(0, 13) = "OBS2"

    Dim rr As Long, p As Variant, pp As String, mq As Double, sq As Double, dif As Double
    rr = 0
    For r = 0 To dKeys.Count - 1
        mq = 0: If dMat.Exists(ks(r)) Then mq = dMat(ks(r))
        sq = 0: If dSrv.Exists(ks(r)) Then sq = dSrv(ks(r))
        ' Pula NULO: nao traz a informacao da linha
        If Round(mq, 2) = 0 And Round(sq, 2) = 0 Then GoTo PulaNulo
        rr = rr + 1
        p = Split(ks(r), "|")
        pp = CStr(p(0))
        dif = Round(Abs(Abs(mq) - Abs(sq)), 2)   ' compara magnitude (estornos negativos)
        ' col 1: veredito do PEP NIVEL 4 (PEP completo)
        If TipoPEPCodigo(pp) = "D" Then
            outp(rr, 1) = "APROVADO"   ' ODD (.D) nao exige aderencia de UC
        ElseIf dVerd.Exists(pp) Then
            outp(rr, 1) = dVerd(pp)
        ElseIf dUAR.Exists(pp) Then
            outp(rr, 1) = "APROVADO"   ' PEP4 sem UC mas com UAR -> aprovado
        Else
            outp(rr, 1) = "SEM UC"     ' PEP4 sem nenhuma familia UC
        End If
        outp(rr, 2) = PEP3(pp)
        outp(rr, 3) = pp
        outp(rr, 4) = p(1)
        ' col 5: TIPO (COM/UC/UAR); vazio -> SERV
        Dim tcls As String: tcls = TipoDaClassif(CStr(p(1)))
        If tcls = "" Then tcls = "SERV"
        outp(rr, 5) = tcls
        outp(rr, 6) = Round(mq, 2)
        outp(rr, 7) = Round(sq, 2)
        ' ODD (.D) nao exige aderencia -> DIFERENCA 0 e SITUACAO ADERENTE
        ' Cabo coberto pelo ramal -> tambem ADERENTE
        If TipoPEPCodigo(pp) = "D" Then
            outp(rr, 8) = 0
            outp(rr, 9) = "ADERENTE"
        ElseIf EhCabo(CStr(p(1))) And cabCov.Exists(pp) Then
            outp(rr, 8) = 0
            outp(rr, 9) = "ADERENTE"
        ElseIf DentroMargem(mq, sq) Then
            outp(rr, 8) = dif
            outp(rr, 9) = "ADERENTE"
        Else
            outp(rr, 8) = dif
            outp(rr, 9) = "NAO ADERENTE"
        End If
        outp(rr, 10) = TipoPEPCodigo(pp)
        outp(rr, 11) = SegmentoPI(pp)
PulaNulo:
    Next r
    EscreverAba "MATERIAL vs SERVICO", outp
End Sub


'==============================================================================
'  ABA: PRECO UNITARIO  (preo unitrio por material + flags de consistncia)
'  PRECO_UNITARIO = VALOR / QTD. Marca em OBS:
'     VAL/QTD NEGATIVO     -> qtd ou valor negativos
'     VAL/QTD ZERADO       -> qtd ou valor = 0
'     MATERIAL NAO CADASTRADO -> cdigo no encontrado no catlogo de materiais
'     OK                   -> linha consistente
'  (Banda MIN/MAX no  calculada: depende de catlogo de preos de referncia.)
'==============================================================================
Private Sub Gerar_PrecoUnitario()
    Dim i As Long, n As Long
    For i = 1 To UBound(dados, 1)
        If Trim$(CStr(dados(i, cPEP))) <> "" Then
            If EhMaterial(CStr(dados(i, cClassif))) Then n = n + 1
        End If
    Next i

    Dim outp() As Variant: ReDim outp(0 To n, 1 To 16)
    outp(0, 1) = "EMPRESA": outp(0, 2) = "PEP": outp(0, 3) = "CLASSE_CUSTO"
    outp(0, 4) = "MATERIAL": outp(0, 5) = "TEXTO_MATERIAL": outp(0, 6) = "UML"
    outp(0, 7) = "QTD_ENTRADA": outp(0, 8) = "VALOR_MOEDA": outp(0, 9) = "PRECO_UNITARIO"
    outp(0, 10) = "MIN_PU": outp(0, 11) = "MAX_PU": outp(0, 12) = "VALOR_DIFERENCA"
    outp(0, 13) = "PERC_DIFERENCA": outp(0, 14) = "CLS2"
    outp(0, 15) = "CLASSIFICACAO": outp(0, 16) = "OBS"

    Dim r As Long, pep As String, q As Double, val As Double, pu As Double, obs As String
    Dim mn As Double, mx As Double, difPU As Double
    Dim cod As String
    For i = 1 To UBound(dados, 1)
        pep = Trim$(CStr(dados(i, cPEP))): If pep = "" Then GoTo Prox
        If Not EhMaterial(CStr(dados(i, cClassif))) Then GoTo Prox
        r = r + 1
        q = ToNum(dados(i, cQtd)): val = ToNum(dados(i, cValor))
        cod = NormCod(dados(i, cMaterial))

        obs = "": pu = 0: mn = 0: mx = 0: difPU = 0
        mn = PUInfo(cod, 0): mx = PUInfo(cod, 1)

        If q < 0 Or val < 0 Then
            obs = "VAL/QTD NEGATIVO": pu = 0
        ElseIf q = 0 Or val = 0 Then
            obs = "VAL/QTD ZERADO": pu = 0
        Else
            pu = Round(val / q, 2)
            If mx > 0 Then
                If pu < mn Then
                    obs = "VALOR ABAIXO DO MINIMO"
                    difPU = Round(pu - mn, 2)
                ElseIf pu > mx Then
                    obs = "VALOR ACIMA DO MAXIMO"
                    difPU = Round(pu - mx, 2)
                Else
                    obs = "OK"
                End If
            ElseIf Not (dCatMat Is Nothing) Then
                If dCatMat.Exists(cod) Then obs = "OK" Else obs = "MATERIAL NAO CADASTRADO"
            Else
                obs = "OK"
            End If
        End If

        outp(r, 1) = ValorCampo(i, cEmpresa)
        outp(r, 2) = pep
        outp(r, 3) = ValorCampo(i, cClasse)
        outp(r, 4) = dados(i, cMaterial)
        outp(r, 5) = ValorCampo(i, cTexto)
        outp(r, 6) = ValorCampo(i, cUML)
        outp(r, 7) = Round(q, 2)
        outp(r, 8) = Round(val, 2)
        outp(r, 9) = pu
        If mn > 0 Then outp(r, 10) = mn
        If mx > 0 Then outp(r, 11) = mx
        outp(r, 12) = difPU
        If difPU <> 0 And pu <> 0 Then outp(r, 13) = Round(Abs(difPU) / pu * 100, 2) & "%"
        outp(r, 14) = MatInfoLinha(i, 2)
        outp(r, 15) = dados(i, cClassif)
        outp(r, 16) = obs
Prox:
    Next i
    EscreverAba "PRECO UNITARIO", outp
End Sub


'==============================================================================
'  ABA: ANALISE DE CA  (CA por PEP x Descrio SA)
'==============================================================================
Private Sub Gerar_AnaliseCA()
    Dim cats As Variant
    cats = Array("JOA", "LOGISTICA", "TRIBUTOS", "SUPORTE", "FRETE_TRANSP", _
                 "PUBLICIDADE", "MEIO AMBIENTE", "APOIO A OBRA", "COMISSIONAMENTO", _
                 "FISCALIZACAO", "PROJETO", "PROJETO_DRT_OBRA", "ATIVACAO DIRETA", _
                 "MAO DE OBRA CIVIL", "DISPONIBILIDADE", "MAO DE OBRA", "MOP", _
                 "RISCO", "MAT UC", "MAT COM", "VALOR MATERIAL", "OUTROS", _
                 "BAIXA ODD ODS", "CLASSIFICAR")

    Dim dPEP As Object, dGrp As Object, dPepTot As Object, dEmp As Object
    Set dPEP = CreateObject("Scripting.Dictionary")
    Set dGrp = CreateObject("Scripting.Dictionary")
    Set dPepTot = CreateObject("Scripting.Dictionary")
    Set dEmp = CreateObject("Scripting.Dictionary")

    Dim i As Long, pep As String, cat As String, val As Double, k As String
    For i = 1 To UBound(dados, 1)
        pep = Trim$(CStr(dados(i, cPEP))): If pep = "" Then GoTo P1
        val = ToNum(dados(i, cValor))
        If Not dPEP.Exists(pep) Then dPEP.Add pep, dPEP.Count
        If Not dEmp.Exists(pep) Then dEmp(pep) = TextoCampo(i, cEmpresa)
        dPepTot(pep) = dPepTot(pep) + val

        cat = CategoriaAnaliseCA(i)
        k = pep & "|" & cat
        dGrp(k) = dGrp(k) + val

        If cat = "MAT UC" Or cat = "MAT COM" Then
            dGrp(pep & "|VALOR MATERIAL") = dGrp(pep & "|VALOR MATERIAL") + val
        End If
P1:
    Next i

    If dPEP.Count = 0 Then Exit Sub
    Dim peps As Variant: peps = dPEP.Keys
    Dim outp() As Variant: ReDim outp(0 To dPEP.Count, 1 To 38)
    outp(0, 1) = "EMPRESA": outp(0, 2) = "PEP"
    Dim j As Long
    For j = 0 To UBound(cats): outp(0, 3 + j) = cats(j): Next j
    outp(0, 27) = "VALOR TOTAL": outp(0, 28) = "PORC ATV DRT 25%"
    outp(0, 29) = "PORC MOP": outp(0, 30) = "UC MENOR 10%"
    outp(0, 31) = "TIPO PEP"
    outp(0, 32) = "ATV PREVISTA": outp(0, 33) = "DIF ATV DRT"
    outp(0, 34) = "REF FRETE": outp(0, 35) = "PI"
    outp(0, 36) = "TOTAL CA SEM MOP": outp(0, 37) = "CALCULO DO MOP"
    outp(0, 38) = "DIF MOP"

    Dim r As Long, tot As Double, v As Double, mao As Double, atv As Double
    Dim mop As Double, totalSemMop As Double, matUc As Double, atvPrev As Double, calcMop As Double
    For r = 0 To dPEP.Count - 1
        pep = peps(r)
        outp(r + 1, 1) = dEmp(pep)
        outp(r + 1, 2) = pep
        For j = 0 To UBound(cats)
            k = pep & "|" & cats(j): v = 0
            If dGrp.Exists(k) Then v = dGrp(k)
            outp(r + 1, 3 + j) = Round(v, 2): tot = tot + v
        Next j
        tot = dPepTot(pep)
        mao = ValorCat(dGrp, pep, "MAO DE OBRA")
        atv = ValorCat(dGrp, pep, "ATIVACAO DIRETA")
        mop = ValorCat(dGrp, pep, "MOP")
        matUc = ValorCat(dGrp, pep, "MAT UC")
        totalSemMop = tot - mop
        atvPrev = Round(mao * 0.25, 2)
        calcMop = Round(totalSemMop * 0.05483, 2)

        outp(r + 1, 27) = Round(tot, 2)
        If mao <> 0 Then outp(r + 1, 28) = Round(atv / mao * 100, 2) & "%"
        If totalSemMop <> 0 Then outp(r + 1, 29) = Round(mop / totalSemMop * 100, 2) & "%"
        If tot <> 0 Then outp(r + 1, 30) = Round(matUc / tot * 100, 2) & "%"
        outp(r + 1, 31) = TipoPEP(pep)
        outp(r + 1, 32) = atvPrev
        outp(r + 1, 33) = Round(atv - atvPrev, 2)
        outp(r + 1, 34) = ValorCat(dGrp, pep, "FRETE_TRANSP")
        outp(r + 1, 35) = SegmentoPI(pep)
        outp(r + 1, 36) = Round(totalSemMop, 2)
        outp(r + 1, 37) = calcMop
        outp(r + 1, 38) = Round(mop - calcMop, 2)
    Next r
    EscreverAba "ANALISE DE CA", outp
End Sub

Private Function ValorCat(dGrp As Object, ByVal pep As String, ByVal cat As String) As Double
    ValorCat = 0
    If dGrp.Exists(pep & "|" & cat) Then ValorCat = dGrp(pep & "|" & cat)
End Function

Private Function CategoriaAnaliseCA(ByVal lin As Long) As String
    Dim cls2 As String, cls3 As String, c As String, cl As String, cat As String
    cl = UCase$(SemAcento(CStr(dados(lin, cClassif))))

    ' A classe de custo e a fonte mais confiavel para indiretos da ANALISE DE CA.
    cat = CategoriaPorClasseCusto(lin)
    If cat <> "" Then CategoriaAnaliseCA = cat: Exit Function

    If EhMaterial(CStr(dados(lin, cClassif))) Then
        cls3 = UCase$(SemAcento(MatInfoLinha(lin, 3)))
        If InStr(cl, "UC") > 0 Or InStr(cls3, "UC") > 0 Then CategoriaAnaliseCA = "MAT UC": Exit Function
        If InStr(cl, "COM") > 0 Or InStr(cls3, "COM") > 0 Then CategoriaAnaliseCA = "MAT COM": Exit Function
        CategoriaAnaliseCA = "OUTROS": Exit Function
    End If

    cls2 = UCase$(SemAcento(SrvInfoLinha(lin, 1)))
    cls3 = UCase$(SemAcento(SrvInfoLinha(lin, 2)))

    cat = MapCategoriaCA(cls3)
    If cat <> "" Then CategoriaAnaliseCA = cat: Exit Function
    cat = MapCategoriaCA(cls2)
    If cat <> "" Then CategoriaAnaliseCA = cat: Exit Function

    c = cls3 & " " & cls2 & " " & UCase$(SemAcento(TextoCampo(lin, cDescSA)))

    If InStr(c, "CLASSIFICAR") > 0 Then CategoriaAnaliseCA = "CLASSIFICAR": Exit Function
    If InStr(c, "RISCO") > 0 Then CategoriaAnaliseCA = "RISCO": Exit Function
    If InStr(c, "MOP") > 0 Then CategoriaAnaliseCA = "MOP": Exit Function
    If InStr(c, "FRETE") > 0 Or InStr(c, "TRANSP") > 0 Then CategoriaAnaliseCA = "FRETE_TRANSP": Exit Function
    If InStr(c, "FISCAL") > 0 Then CategoriaAnaliseCA = "FISCALIZACAO": Exit Function
    If InStr(c, "PROJETO DRT") > 0 Then CategoriaAnaliseCA = "PROJETO_DRT_OBRA": Exit Function
    If InStr(c, "PROJETO") > 0 Then CategoriaAnaliseCA = "PROJETO": Exit Function
    If InStr(c, "ATIVACAO") > 0 Or InStr(c, "ATV DRT") > 0 Then CategoriaAnaliseCA = "ATIVACAO DIRETA": Exit Function
    If InStr(c, "APOIO") > 0 Then CategoriaAnaliseCA = "APOIO A OBRA": Exit Function
    If InStr(c, "COMISSION") > 0 Then CategoriaAnaliseCA = "COMISSIONAMENTO": Exit Function
    If InStr(c, "LOGIST") > 0 Then CategoriaAnaliseCA = "LOGISTICA": Exit Function
    If InStr(c, "TRIBUT") > 0 Then CategoriaAnaliseCA = "TRIBUTOS": Exit Function
    If InStr(c, "SUPORTE") > 0 Then CategoriaAnaliseCA = "SUPORTE": Exit Function
    If InStr(c, "PUBLIC") > 0 Then CategoriaAnaliseCA = "PUBLICIDADE": Exit Function
    If InStr(c, "MEIO AMBIENTE") > 0 Or InStr(c, "AMBIENT") > 0 Then CategoriaAnaliseCA = "MEIO AMBIENTE": Exit Function
    If InStr(c, "CIVIL") > 0 Then CategoriaAnaliseCA = "MAO DE OBRA CIVIL": Exit Function
    If InStr(c, "DISPONIBIL") > 0 Then CategoriaAnaliseCA = "DISPONIBILIDADE": Exit Function
    If InStr(c, "MAO DE OBRA") > 0 Or InStr(c, "M O") > 0 Then CategoriaAnaliseCA = "MAO DE OBRA": Exit Function
    If InStr(c, "BAIXA") > 0 Then CategoriaAnaliseCA = "BAIXA ODD ODS": Exit Function
    If InStr(c, "JOA") > 0 Then CategoriaAnaliseCA = "JOA": Exit Function
    CategoriaAnaliseCA = "OUTROS"
End Function

Private Function CategoriaPorClasseCusto(ByVal lin As Long) As String
    Dim cls2 As String, cls3 As String
    If ClasseCustoDadosOutros(ValorCampo(lin, cClasse)) Then
        CategoriaPorClasseCusto = "OUTROS"
        Exit Function
    End If

    cls3 = CCInfo(ValorCampo(lin, cClasse), 2)
    CategoriaPorClasseCusto = MapCategoriaCA(cls3)
    If CategoriaPorClasseCusto <> "" Then Exit Function

    cls2 = CCInfo(ValorCampo(lin, cClasse), 1)
    CategoriaPorClasseCusto = MapCategoriaCA(cls2)
End Function

Private Function ClasseCustoDadosOutros(codCC As Variant) As Boolean
    Select Case NormCod(codCC)
        Case "8119980000" ' COM - Combustiveis e Lubrificantes
            ClasseCustoDadosOutros = True
    End Select
End Function

Private Function MapCategoriaCA(ByVal valor As String) As String
    Dim s As String
    s = UCase$(SemAcento(Trim$(valor)))
    s = Replace(s, "/", "_")
    s = Replace(s, "-", "_")
    s = Replace(s, "  ", " ")

    If s = "" Then Exit Function
    If InStr(s, "CLASSIFICAR") > 0 Then MapCategoriaCA = "CLASSIFICAR": Exit Function
    If InStr(s, "RISCO") > 0 Then MapCategoriaCA = "RISCO": Exit Function
    If InStr(s, "MOP") > 0 Then MapCategoriaCA = "MOP": Exit Function
    If InStr(s, "JOA") > 0 Then MapCategoriaCA = "JOA": Exit Function
    If InStr(s, "TRIBUT") > 0 Or InStr(s, "ODC_MATERIAL") > 0 Then MapCategoriaCA = "TRIBUTOS": Exit Function
    If InStr(s, "FRETE") > 0 Or InStr(s, "TRANSP") > 0 Then MapCategoriaCA = "FRETE_TRANSP": Exit Function
    If InStr(s, "SUPORTE") > 0 Or InStr(s, "ALIMENTACAO") > 0 _
       Or InStr(s, "HOSPEDAGEM") > 0 Or InStr(s, "PASSAGEM") > 0 _
       Or InStr(s, "MOBILIDADE") > 0 Then MapCategoriaCA = "SUPORTE": Exit Function
    If InStr(s, "PUBLIC") > 0 Then MapCategoriaCA = "PUBLICIDADE": Exit Function
    If InStr(s, "FISCAL") > 0 Then MapCategoriaCA = "FISCALIZACAO": Exit Function
    If InStr(s, "PROJETO DRT") > 0 Or InStr(s, "PROJETO_DRT") > 0 Then MapCategoriaCA = "PROJETO_DRT_OBRA": Exit Function
    If InStr(s, "PROJETO") > 0 Then MapCategoriaCA = "PROJETO": Exit Function
    If InStr(s, "ATIVACAO") > 0 Or InStr(s, "ATV DRT") > 0 Then MapCategoriaCA = "ATIVACAO DIRETA": Exit Function
    If InStr(s, "APOIO") > 0 Then MapCategoriaCA = "APOIO A OBRA": Exit Function
    If InStr(s, "COMISSION") > 0 Then MapCategoriaCA = "COMISSIONAMENTO": Exit Function
    If InStr(s, "LOGIST") > 0 Then MapCategoriaCA = "LOGISTICA": Exit Function
    If InStr(s, "MEIO AMBIENTE") > 0 Or InStr(s, "AMBIENT") > 0 Then MapCategoriaCA = "MEIO AMBIENTE": Exit Function
    If InStr(s, "CIVIL") > 0 Then MapCategoriaCA = "MAO DE OBRA CIVIL": Exit Function
    If InStr(s, "DISPONIBIL") > 0 Then MapCategoriaCA = "DISPONIBILIDADE": Exit Function
    If InStr(s, "MAO DE OBRA") > 0 Or InStr(s, "M O") > 0 Then MapCategoriaCA = "MAO DE OBRA": Exit Function
    If InStr(s, "BAIXA") > 0 Then MapCategoriaCA = "BAIXA ODD ODS": Exit Function
    If InStr(s, "MAT UC") > 0 Then MapCategoriaCA = "MAT UC": Exit Function
    If InStr(s, "MAT COM") > 0 Then MapCategoriaCA = "MAT COM": Exit Function
    If InStr(s, "VALOR MATERIAL") > 0 Then MapCategoriaCA = "VALOR MATERIAL"
End Function


'==============================================================================
'  ABA: CLASSE DE CUSTO  (por PEP x classe)
'==============================================================================
Private Sub Gerar_ClasseDeCusto()
    Dim dGrp As Object, dQtd As Object, dCnt As Object, dDesc As Object, dEmpresa As Object
    Set dGrp = CreateObject("Scripting.Dictionary")
    Set dQtd = CreateObject("Scripting.Dictionary")
    Set dCnt = CreateObject("Scripting.Dictionary")
    Set dDesc = CreateObject("Scripting.Dictionary")
    Set dEmpresa = CreateObject("Scripting.Dictionary")

    Dim i As Long, pep As String, cc As String, k As String
    For i = 1 To UBound(dados, 1)
        pep = Trim$(CStr(dados(i, cPEP))): If pep = "" Then GoTo Prox
        cc = TextoCampo(i, cClasse)
        k = pep & "|" & cc
        dGrp(k) = dGrp(k) + ToNum(dados(i, cValor))
        dQtd(k) = dQtd(k) + ToNum(dados(i, cQtd))
        dCnt(k) = dCnt(k) + 1
        If cDescClasse > 0 And Not dDesc.Exists(k) Then dDesc(k) = TextoCampo(i, cDescClasse)
        If Not dEmpresa.Exists(k) Then dEmpresa(k) = TextoCampo(i, cEmpresa)
Prox:
    Next i

    Dim ks As Variant: ks = dGrp.Keys
    Dim outp() As Variant: ReDim outp(0 To dGrp.Count, 1 To 11)
    outp(0, 1) = "EMPRESA": outp(0, 2) = "PEP": outp(0, 3) = "TIPO_PEP"
    outp(0, 4) = "CLASSE_CUSTO": outp(0, 5) = "DESC_CLASSE_CUSTO"
    outp(0, 6) = "QTD_ENTRADA": outp(0, 7) = "CLS1": outp(0, 8) = "CLS2"
    outp(0, 9) = "CLS3": outp(0, 10) = "VALOR_MOEDA": outp(0, 11) = "LANCAMENTOS"
    Dim r As Long, p As Variant
    For r = 0 To dGrp.Count - 1
        p = Split(ks(r), "|")
        outp(r + 1, 1) = dEmpresa(ks(r))
        outp(r + 1, 2) = p(0)
        outp(r + 1, 3) = TipoPEPANEEL(CStr(p(0)))
        outp(r + 1, 4) = p(1)
        If dDesc.Exists(ks(r)) Then outp(r + 1, 5) = dDesc(ks(r))
        outp(r + 1, 6) = Round(dQtd(ks(r)), 2)
        outp(r + 1, 7) = CCInfo(p(1), 0)
        outp(r + 1, 8) = CCInfo(p(1), 1)
        outp(r + 1, 9) = CCInfo(p(1), 2)
        outp(r + 1, 10) = Round(dGrp(ks(r)), 2)
        outp(r + 1, 11) = dCnt(ks(r))
    Next r
    EscreverAba "CLASSE DE CUSTO", outp
End Sub


'==============================================================================
'  ABA: MATERIAL  (detalhe UC/COM/UAR/Falta + anomalias)
'==============================================================================
Private Sub Gerar_Material()
    ' Consolida por PEP + MATERIAL + CLASSIFICACAO: soma QTD e VALOR numa unica
    ' linha (entradas e estornos), mostrando o liquido correto de entrada/saida.
    Dim dQ As Object, dV As Object, dFirst As Object
    Set dQ = CreateObject("Scripting.Dictionary")
    Set dV = CreateObject("Scripting.Dictionary")
    Set dFirst = CreateObject("Scripting.Dictionary")   ' chave -> indice da 1a linha

    Dim i As Long, pep As String, cod As String, cl As String, k As String
    For i = 1 To UBound(dados, 1)
        pep = Trim$(CStr(dados(i, cPEP))): If pep = "" Then GoTo Prox
        If Not EhMaterial(CStr(dados(i, cClassif))) Then GoTo Prox
        cod = NormCod(dados(i, cMaterial))
        cl = UCase$(Trim$(CStr(dados(i, cClassif))))
        k = pep & "|" & cod & "|" & cl
        If Not dFirst.Exists(k) Then dFirst(k) = i
        dQ(k) = dQ(k) + ToNum(dados(i, cQtd))
        dV(k) = dV(k) + ToNum(dados(i, cValor))
Prox:
    Next i

    ' Anomalia que NAO deve ser trazida na aba MATERIAL
    Const ANOM_EXCL As String = "FALTA CODIGO MATERIAL | QTD ZERO / VALOR <> 0"

    Dim ks As Variant: ks = dFirst.Keys
    Dim r As Long, fi As Long, q As Double, val As Double, anom As String

    ' 1a passada: conta as linhas que ficam (exclui a anomalia acima e QTD=0 e VALOR=0)
    Dim nKeep As Long
    For r = 0 To dFirst.Count - 1
        fi = dFirst(ks(r))
        q = Round(dQ(ks(r)), 2): val = Round(dV(ks(r)), 2)
        If q = 0 And val = 0 Then GoTo PulaConta
        If Anomalia(CStr(dados(fi, cClassif)), q, val) <> ANOM_EXCL Then nKeep = nKeep + 1
PulaConta:
    Next r

    Dim outp() As Variant: ReDim outp(0 To nKeep, 1 To 14)
    outp(0, 1) = "PEP": outp(0, 2) = "PEP3": outp(0, 3) = "TIPO_PEP"
    outp(0, 4) = "MATERIAL": outp(0, 5) = "TEXTO_MATERIAL": outp(0, 6) = "UML"
    outp(0, 7) = "QTD_ENTRADA": outp(0, 8) = "VALOR_MOEDA"
    outp(0, 9) = "CLASSIFICACAO"
    outp(0, 10) = "CLS1": outp(0, 11) = "CLS2": outp(0, 12) = "CLS3"
    outp(0, 13) = "ANOMALIA": outp(0, 14) = "PRIORIDADE"

    Dim rr As Long: rr = 0
    For r = 0 To dFirst.Count - 1
        k = ks(r): fi = dFirst(k)
        pep = Trim$(CStr(dados(fi, cPEP)))
        q = Round(dQ(k), 2): val = Round(dV(k), 2)
        If q = 0 And val = 0 Then GoTo PulaAnom   ' QTD=0 e VALOR=0 -> nao traz
        anom = Anomalia(CStr(dados(fi, cClassif)), q, val)
        If anom = ANOM_EXCL Then GoTo PulaAnom   ' nao traz esta anomalia
        rr = rr + 1
        outp(rr, 1) = pep: outp(rr, 2) = PEP3(pep): outp(rr, 3) = TipoPEPANEEL(pep)
        outp(rr, 4) = NormCod(dados(fi, cMaterial)): outp(rr, 5) = ValorCampo(fi, cTexto)
        outp(rr, 6) = ValorCampo(fi, cUML)
        outp(rr, 7) = q: outp(rr, 8) = val
        outp(rr, 9) = dados(fi, cClassif)
        outp(rr, 10) = MatInfoLinha(fi, 1)   ' CLS1
        outp(rr, 11) = MatInfoLinha(fi, 2)   ' CLS2
        outp(rr, 12) = MatInfoLinha(fi, 3)   ' CLS3
        outp(rr, 13) = anom
        If anom <> "" Then outp(rr, 14) = "ALTA"
PulaAnom:
    Next r
    EscreverAba "MATERIAL", outp
End Sub


'==============================================================================
'  ABA: SERVIO  (detalhe das linhas que NO so material: CA/servios)
'==============================================================================
Private Sub Gerar_Servico()
    ' Consolida por PEP + COD_SERVICO: soma QTD e VALOR numa unica linha.
    ' Linhas sem COD_SERVICO nao sao trazidas.
    Dim dQ As Object, dV As Object, dFirst As Object
    Set dQ = CreateObject("Scripting.Dictionary")
    Set dV = CreateObject("Scripting.Dictionary")
    Set dFirst = CreateObject("Scripting.Dictionary")   ' chave -> indice da 1a linha

    Dim i As Long, pep As String, codSrv As String, k As String
    For i = 1 To UBound(dados, 1)
        pep = Trim$(CStr(dados(i, cPEP))): If pep = "" Then GoTo Prox
        If EhMaterial(CStr(dados(i, cClassif))) Then GoTo Prox
        codSrv = NormCod(dados(i, cMaterial))   ' codigo do servico (coluna Material)
        If codSrv = "" Or codSrv = "0" Then GoTo Prox   ' sem COD_SERVICO -> nao traz
        k = pep & "|" & codSrv
        If Not dFirst.Exists(k) Then dFirst(k) = i
        dQ(k) = dQ(k) + ToNum(dados(i, cQtd))
        dV(k) = dV(k) + ToNum(dados(i, cValor))
Prox:
    Next i

    Dim ks As Variant: ks = dFirst.Keys
    Dim r As Long, ki As Long, fi As Long

    ' conta linhas que ficam (exclui QTD=0 e VALOR=0)
    Dim nKeep As Long
    For r = 0 To dFirst.Count - 1
        If Not (Round(dQ(ks(r)), 2) = 0 And Round(dV(ks(r)), 2) = 0) Then nKeep = nKeep + 1
    Next r

    Dim outp() As Variant: ReDim outp(0 To nKeep, 1 To 12)
    outp(0, 1) = "PEP": outp(0, 2) = "PEP3": outp(0, 3) = "TIPO_PEP"
    outp(0, 4) = "COD_SERVICO": outp(0, 5) = "CLASSE_CUSTO"
    outp(0, 6) = "QTD_ENTRADA": outp(0, 7) = "VALOR_MOEDA"
    outp(0, 8) = "CLS1": outp(0, 9) = "CLS2": outp(0, 10) = "CLS3"
    outp(0, 11) = "TIPO_APLICACAO": outp(0, 12) = "GRUPO_PERC"

    ki = 0
    For r = 0 To dFirst.Count - 1
        k = ks(r): fi = dFirst(k)
        If Round(dQ(k), 2) = 0 And Round(dV(k), 2) = 0 Then GoTo PulaZero   ' QTD=0 e VALOR=0
        ki = ki + 1
        pep = Trim$(CStr(dados(fi, cPEP)))
        outp(ki, 1) = pep: outp(ki, 2) = PEP3(pep): outp(ki, 3) = TipoPEPANEEL(pep)
        outp(ki, 4) = NormCod(dados(fi, cMaterial))
        outp(ki, 5) = ValorCampo(fi, cClasse)
        outp(ki, 6) = Round(dQ(k), 2)
        outp(ki, 7) = Round(dV(k), 2)
        outp(ki, 8) = SrvInfoLinha(fi, 0)    ' CLS1
        outp(ki, 9) = SrvInfoLinha(fi, 1)    ' CLS2
        outp(ki, 10) = SrvInfoLinha(fi, 2)   ' CLS3
        outp(ki, 11) = SrvInfoLinha(fi, 3)   ' TIPO_APLICACAO
        outp(ki, 12) = GrupoPerc(pep)
PulaZero:
    Next r
    EscreverAba "SERVICO", outp
End Sub


'==============================================================================
'  ABA: RISCO  (linhas cuja CLASSE DE CUSTO  marcada como RISCO no catlogo)
'  Identifica custos de risco: locao de equipamentos, saldo remanescente,
'  servio em SE, geradores, etc. (CLS3 = "RISCO" em CLASSE_CUSTO_ATUAIS).
'==============================================================================
Private Sub Gerar_Risco()
    ' Sem catlogo de classe de custo no h como identificar risco
    If dCatCC Is Nothing Then Exit Sub
    If dCatCC.Count = 0 Then Exit Sub

    Dim i As Long, n As Long, cls3 As String
    For i = 1 To UBound(dados, 1)
        If Trim$(CStr(dados(i, cPEP))) = "" Then GoTo C1
        cls3 = UCase$(CCInfo(ValorCampo(i, cClasse), 2))
        If cls3 = "RISCO" Then n = n + 1
C1:
    Next i

    Dim outp() As Variant: ReDim outp(0 To n, 1 To 7)
    outp(0, 1) = "PEP": outp(0, 2) = "CLASSE_CUSTO": outp(0, 3) = "SERVICO"
    outp(0, 4) = "DESCRICAO": outp(0, 5) = "QTD_ENTRADA"
    outp(0, 6) = "VALOR_MOEDA": outp(0, 7) = "CLS3"

    Dim r As Long, pep As String, desc As String
    For i = 1 To UBound(dados, 1)
        pep = Trim$(CStr(dados(i, cPEP))): If pep = "" Then GoTo Prox
        cls3 = UCase$(CCInfo(ValorCampo(i, cClasse), 2))
        If cls3 <> "RISCO" Then GoTo Prox
        r = r + 1
        ' Descrio: prioriza Descrio SA, depois texto do material, depois desc. classe
        desc = ""
        desc = TextoCampo(i, cDescSA)
        If desc = "" Then desc = TextoCampo(i, cTexto)
        If desc = "" Then desc = TextoCampo(i, cDescClasse)

        outp(r, 1) = pep
        outp(r, 2) = ValorCampo(i, cClasse)
        ' Em linhas de servio/CA o cdigo do servio fica em "Material"
        If Not EhMaterial(CStr(dados(i, cClassif))) Then outp(r, 3) = dados(i, cMaterial)
        outp(r, 4) = desc
        outp(r, 5) = Round(ToNum(dados(i, cQtd)), 2)
        outp(r, 6) = Round(ToNum(dados(i, cValor)), 2)
        outp(r, 7) = "RISCO"
Prox:
    Next i
    EscreverAba "RISCO", outp
End Sub


'==============================================================================
'  ABA: ANOMALIAS  (subconjunto com problema)
'==============================================================================
Private Sub Gerar_Anomalias()
    Dim i As Long, n As Long, anom As String, q As Double, val As Double
    For i = 1 To UBound(dados, 1)
        If Trim$(CStr(dados(i, cPEP))) = "" Then GoTo C1
        q = ToNum(dados(i, cQtd)): val = ToNum(dados(i, cValor))
        If Anomalia(CStr(dados(i, cClassif)), q, val) <> "" Then n = n + 1
C1:
    Next i

    Dim outp() As Variant: ReDim outp(0 To n, 1 To 8)
    outp(0, 1) = "PEP": outp(0, 2) = "MATERIAL": outp(0, 3) = "TEXTO_MATERIAL"
    outp(0, 4) = "QTD_ENTRADA": outp(0, 5) = "VALOR_MOEDA"
    outp(0, 6) = "CLASSIFICACAO": outp(0, 7) = "ANOMALIA": outp(0, 8) = "PRIORIDADE"

    Dim r As Long, pep As String
    For i = 1 To UBound(dados, 1)
        pep = Trim$(CStr(dados(i, cPEP))): If pep = "" Then GoTo Prox
        q = ToNum(dados(i, cQtd)): val = ToNum(dados(i, cValor))
        anom = Anomalia(CStr(dados(i, cClassif)), q, val)
        If anom = "" Then GoTo Prox
        r = r + 1
        outp(r, 1) = pep: outp(r, 2) = dados(i, cMaterial): outp(r, 3) = ValorCampo(i, cTexto)
        outp(r, 4) = q: outp(r, 5) = Round(val, 2)
        outp(r, 6) = dados(i, cClassif): outp(r, 7) = anom: outp(r, 8) = "ALTA"
Prox:
    Next i
    EscreverAba "ANOMALIAS", outp
End Sub

Private Function Anomalia(ByVal classif As String, q As Double, val As Double) As String
    Dim s As String, c As String: c = UCase$(Trim$(classif))
    If InStr(c, "FALTA") > 0 Then AddAnomalia s, "FALTA CODIGO MATERIAL"
    If q > 0 And val = 0 Then AddAnomalia s, "QTD+ / VALOR ZERO"
    If q < 0 And val = 0 Then AddAnomalia s, "QTD- / VALOR ZERO"
    If q = 0 And val <> 0 Then AddAnomalia s, "QTD ZERO / VALOR <> 0"
    If val < -3000 Then AddAnomalia s, "VALOR NEGATIVO < -3.000"
    Anomalia = s
End Function

Private Sub AddAnomalia(ByRef destino As String, ByVal nova As String)
    If destino <> "" Then destino = destino & " | "
    destino = destino & nova
End Sub


'==============================================================================
'  ESCRITA + FORMATAO
'==============================================================================
Private Sub EscreverAba(nome As String, outp() As Variant)
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ActiveWorkbook.Worksheets(nome)
    If Not ws Is Nothing Then ws.Delete
    On Error GoTo 0
    Set ws = ActiveWorkbook.Worksheets.Add(After:=ActiveWorkbook.Worksheets(ActiveWorkbook.Worksheets.Count))
    ws.Name = nome

    Dim nR As Long, nC As Long
    nR = UBound(outp, 1) + 1: nC = UBound(outp, 2)
    ws.Range(ws.Cells(1, 1), ws.Cells(nR, nC)).Value = outp

    ' Cabealho
    With ws.Range(ws.Cells(1, 1), ws.Cells(1, nC))
        .Interior.Color = COR_HDR
        .Font.Color = vbWhite: .Font.Bold = True
        .Font.Name = "Arial": .Font.Size = 10
    End With
    ' Corpo
    If nR >= 2 Then
        With ws.Range(ws.Cells(2, 1), ws.Cells(nR, nC))
            .Font.Name = "Arial": .Font.Size = 9
        End With
    End If

    ' Colore TODAS as colunas de veredito (verde = bom / vermelho = problema / cinza = neutro)
    ' Reconhece colunas STATUS / APROV / SITUACAO / OBS.
    If nR >= 2 Then
        Dim jc As Long, hh As String, rr As Long, vv As String, cat As Long
        For jc = 1 To nC
            hh = UCase$(CStr(ws.Cells(1, jc).Value))
            If InStr(hh, "STATUS") > 0 Or InStr(hh, "APROV") > 0 _
               Or InStr(hh, "SITUACAO") > 0 Or hh = "OBS" Then
                For rr = 2 To nR
                    vv = UCase$(Trim$(CStr(ws.Cells(rr, jc).Value)))
                    cat = 0   ' 0 = no colorir, 1 = verde, 2 = vermelho, 3 = cinza
                    If vv = "APROVADO" Or vv = "ADERENTE" Or vv = "OK" Then
                        cat = 1
                    ElseIf InStr(vv, "REPROVAD") > 0 Or vv = "NAO ADERENTE" _
                           Or InStr(vv, "NEGATIV") > 0 Or InStr(vv, "NAO CADASTR") > 0 _
                           Or InStr(vv, "ZERAD") > 0 Or InStr(vv, "ABAIXO") > 0 _
                           Or InStr(vv, "ACIMA") > 0 Then
                        cat = 2
                    ElseIf vv = "NULO" Or vv = "SEM UC" Then
                        cat = 3
                    End If
                    Select Case cat
                        Case 1
                            ws.Cells(rr, jc).Interior.Color = COR_OK
                            ws.Cells(rr, jc).Font.Color = RGB(0, 97, 0)
                            ws.Cells(rr, jc).Font.Bold = True
                        Case 2
                            ws.Cells(rr, jc).Interior.Color = COR_BAD
                            ws.Cells(rr, jc).Font.Color = RGB(156, 0, 6)
                            ws.Cells(rr, jc).Font.Bold = True
                        Case 3
                            ws.Cells(rr, jc).Interior.Color = RGB(217, 217, 217)
                            ws.Cells(rr, jc).Font.Color = RGB(89, 89, 89)
                    End Select
                Next rr
            End If
        Next jc
    End If

    ws.Rows(1).AutoFilter
    ws.Cells.EntireColumn.AutoFit
    ws.Range("A2").Select
    ActiveWindow.FreezePanes = False
    ws.Activate
    ws.Range("A2").Select
    ActiveWindow.FreezePanes = True
End Sub

'##############################################################################
'#                                                                            #
'#   MÓDULO 2 — AUDITOR ANEEL: 9 TESTES FORENSES BRR                        #
'#   (AUDITOR_ANEEL_Main, Duplicidades, ATV DRT, Retroativos, Estornos,      #
'#    Fornecedores, Benford, Sobrepreço, Dashboard, Score Compliance)        #
'#                                                                            #
'##############################################################################

' ============================================================
' AUDITOR ANEEL — VBA Completo de Auditoria Regulatória BRR
' Versão 1.0 | Maio 2026
' Grupo Equatorial Energia / CEEE-Equatorial RS
' ------------------------------------------------------------
' COMO USAR:
'   1. Renomeie a aba com os dados do SAP para: DADOS
'   2. Certifique-se que a linha 1 tem os cabeçalhos
'   3. No VBA Editor (Alt+F11): Arquivo > Importar Arquivo > selecione este .bas
'   4. Feche o editor e pressione Alt+F8 > AUDITOR_ANEEL_Main > Executar
' ============================================================


' ============================================================
' CONSTANTES REGULATÓRIAS (PRORET 2.3 | NT 77/2025-STR)
' ============================================================
Const WACC_REAL        As Double = 0.081   ' 8,10% a.a. real após impostos
Const BPR_TOLERANCIA   As Double = 0.1     ' ±10% VOC vs VNR por Tipo de Instalação
Const ATV_DRT_LIMITE   As Double = 0.25    ' 25% — normal
Const ATV_DRT_ANOMALIA As Double = 0.5     ' 50% — anomalia
Const ATV_DRT_CRITICO  As Double = 1.0     ' 100% — crítico extremo
Const MATERIALIDADE    As Double = 50000   ' R$ 50.000 (ISA 320)
Const ESTORNO_ATENCAO  As Double = 0.05    ' 5% — atenção
Const ESTORNO_ANOMALO  As Double = 0.2     ' 20% — anômalo
Const CONC_LIMITE      As Double = 0.5     ' 50% top3 — limite
Const CONC_CRITICO     As Double = 0.7     ' 70% top3 — crítico
Const BENFORD_CONF     As Double = 0.6     ' MAD < 0,6 → conformidade
Const BENFORD_ACEIT    As Double = 1.2     ' MAD < 1,2 → aceitável
Const BENFORD_LEVE     As Double = 1.5     ' MAD < 1,5 → leve não-conformidade
Const RETRO_OK         As Integer = 90     ' dias — atraso aceitável
Const RETRO_CRITICO    As Integer = 365    ' dias — crítico

' ============================================================
' VARIÁVEIS GLOBAIS — índices de colunas na aba DADOS
' ============================================================
Dim colPEP      As Integer
Dim colCLASSE   As Integer
Dim colDESC     As Integer
Dim colVALOR    As Integer
Dim colDATALANC As Integer
Dim colDATADOC  As Integer
Dim colNUMDOC   As Integer
Dim colMATERIAL As Integer
Dim colTEXTO    As Integer
Dim colQTD      As Integer
Dim colDENOM    As Integer
Dim colUSUARIO  As Integer
Dim colTIPODOC  As Integer
Dim colTIPOAPL  As Integer
Dim colUML      As Integer
Dim ultimaLinha As Long

' ============================================================
' PONTO DE ENTRADA PRINCIPAL
' ============================================================
Sub AUDITOR_ANEEL_Main()

    Dim t0 As Double
    t0 = Timer

    Application.ScreenUpdating = False
    Application.Calculation = xlCalculationManual
    Application.DisplayStatusBar = True

    If Not AbaExiste("DADOS") Then
        MsgBox "Aba 'DADOS' não encontrada!" & vbCrLf & _
               "Renomeie a aba com os lançamentos SAP para 'DADOS' e tente novamente.", _
               vbCritical, "AUDITOR ANEEL"
        GoTo Fim
    End If

    Application.StatusBar = "AUDITOR ANEEL | Mapeando colunas..."
    If Not MapearColunasAudit() Then GoTo Fim

    Application.StatusBar = "AUDITOR ANEEL | Criando abas de resultado..."
    CriarAbas

    Application.StatusBar = "AUDITOR ANEEL | [1/8] Classificando lançamentos..."
    GerarClassificacao

    Application.StatusBar = "AUDITOR ANEEL | [2/8] Duplicidades..."
    AnalisarDuplicidades

    Application.StatusBar = "AUDITOR ANEEL | [3/8] ATV DRT..."
    AnalisarATVDRT

    Application.StatusBar = "AUDITOR ANEEL | [4/8] Retroativos CPC 23..."
    AnalisarRetroativos

    Application.StatusBar = "AUDITOR ANEEL | [5/8] Estornos..."
    AnalisarEstornos

    Application.StatusBar = "AUDITOR ANEEL | [6/8] Fornecedores..."
    AnalisarFornecedores

    Application.StatusBar = "AUDITOR ANEEL | [7/8] Benford MAD..."
    AnalisarBenford

    Application.StatusBar = "AUDITOR ANEEL | [8/20] Sobrepreço BPR..."
    AnalisarSobrepreco

    Application.StatusBar = "AUDITOR ANEEL | [9/20] OPEX em ODI..."
    AnalisarOpexEmODI
    Application.StatusBar = "AUDITOR ANEEL | [10/20] CAPEX em ODM/ODD..."
    AnalisarCapexEmODM
    Application.StatusBar = "AUDITOR ANEEL | [11/20] Despesas vedadas..."
    AnalisarDespesasVedadas
    Application.StatusBar = "AUDITOR ANEEL | [12/20] Obrigações Especiais..."
    AnalisarObrigEspeciais
    Application.StatusBar = "AUDITOR ANEEL | [13/20] AIC / Unitização..."
    AnalisarAICUnitizacao
    Application.StatusBar = "AUDITOR ANEEL | [14/20] JOA..."
    AnalisarJOA
    Application.StatusBar = "AUDITOR ANEEL | [15/20] Custos Adicionais / COM..."
    AnalisarCustosAdicionais
    Application.StatusBar = "AUDITOR ANEEL | [16/20] Ativos administrativos..."
    AnalisarAtivosAdmin
    Application.StatusBar = "AUDITOR ANEEL | [17/20] Duplicidade entre obras..."
    AnalisarDuplicEntreObras
    Application.StatusBar = "AUDITOR ANEEL | [18/20] Integridade cadastral..."
    AnalisarIntegridadeCad
    Application.StatusBar = "AUDITOR ANEEL | [19/20] Obra sem lastro físico..."
    AnalisarObraSemLastro
    Application.StatusBar = "AUDITOR ANEEL | [20/27] Terrenos e servidões..."
    AnalisarTerrenosServidoes

    Application.StatusBar = "AUDITOR ANEEL | [21/27] Valores redondos..."
    AnalisarValoresRedondos
    Application.StatusBar = "AUDITOR ANEEL | [22/27] Fim de semana / feriados..."
    AnalisarFimDeSemana
    Application.StatusBar = "AUDITOR ANEEL | [23/27] Cutoff de exercício..."
    AnalisarCutoffExercicio
    Application.StatusBar = "AUDITOR ANEEL | [24/27] Fracionamento..."
    AnalisarFracionamento
    Application.StatusBar = "AUDITOR ANEEL | [25/27] Benford 2º dígito..."
    AnalisarBenfordD2
    Application.StatusBar = "AUDITOR ANEEL | [26/27] Concentração por usuário..."
    AnalisarUsuarios
    Application.StatusBar = "AUDITOR ANEEL | [27/27] Estorno e relançamento..."
    AnalisarEstornoRelanc

    Application.StatusBar = "AUDITOR ANEEL | Dashboard + Score..."
    GerarDashboard
    GerarResumoExecutivo

Fim:
    Application.ScreenUpdating = True
    Application.Calculation = xlCalculationAutomatic
    Application.StatusBar = False

    MsgBox "AUDITOR ANEEL concluído em " & Format(Timer - t0, "0.0") & "s" & vbCrLf & _
           "Acesse a aba DASHBOARD para o resultado.", vbInformation, "AUDITOR ANEEL"

    If AbaExiste("DASHBOARD") Then Sheets("DASHBOARD").Activate

End Sub

' ============================================================
' MAPEAMENTO DINÂMICO DE COLUNAS (por nome do cabeçalho)
' ============================================================
Function MapearColunasAudit() As Boolean

    Dim ws As Worksheet
    Set ws = Sheets("DADOS")
    Dim j As Integer, lastCol As Integer
    lastCol = ws.Cells(1, ws.Columns.Count).End(xlToLeft).Column
    ultimaLinha = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row

    colPEP = 0: colCLASSE = 0: colDESC = 0: colVALOR = 0
    colDATALANC = 0: colDATADOC = 0: colNUMDOC = 0
    colMATERIAL = 0: colTEXTO = 0: colQTD = 0
    colDENOM = 0: colUSUARIO = 0: colTIPODOC = 0
    colTIPOAPL = 0: colUML = 0

    For j = 1 To lastCol
        Select Case UCase(Trim(ws.Cells(1, j).Value))
            Case "PEP":               colPEP = j
            Case "CLASSE_CUSTO":      colCLASSE = j
            Case "DESC_CLASSE_CUSTO": colDESC = j
            Case "VALOR_MOEDA":       colVALOR = j
            Case "DATA_LANCAMENTO":   colDATALANC = j
            Case "DATA_DOCUMENTO":    colDATADOC = j
            Case "NUM_DOC":           colNUMDOC = j
            Case "MATERIAL":          colMATERIAL = j
            Case "TEXTO_MATERIAL":    colTEXTO = j
            Case "QTD_ENTRADA":       colQTD = j
            Case "DENOMINACAO":       colDENOM = j
            Case "USUARIO":           colUSUARIO = j
            Case "TIPO_DOC":          colTIPODOC = j
            Case "TIPO_APLICACAO":    colTIPOAPL = j
            Case "UML":               colUML = j
        End Select
    Next j

    If colPEP = 0 Or colVALOR = 0 Then
        MsgBox "Colunas obrigatórias não encontradas (PEP e VALOR_MOEDA)." & vbCrLf & _
               "Verifique os cabeçalhos na linha 1 da aba DADOS.", vbCritical, "AUDITOR ANEEL"
        MapearColunasAudit = False
    Else
        MapearColunasAudit = True
    End If

End Function

' ============================================================
' CRIAR / RECRIAR ABAS DE RESULTADO
' ============================================================
Sub CriarAbas()

    Dim nomes As Variant
    nomes = Array("CLASSIFICACAO", "DUPLICIDADES", "ATV_DRT", "RETROATIVOS", _
                  "ESTORNOS", "FORNECEDORES", "BENFORD", "SOBREPRECO", _
                  "OPEX EM ODI", "CAPEX ODM ODD", "DESPESAS VEDADAS", _
                  "OBRIG ESPECIAIS", "AIC UNITIZACAO", "JOA", _
                  "CUSTOS ADICIONAIS", "ATIVOS ADMIN", "DUPLIC ENTRE OBRAS", _
                  "INTEGRIDADE CAD", "OBRA SEM LASTRO", "TERRENOS SERVID", _
                  "VALORES REDONDOS", "FDS FERIADOS", "CUTOFF EXERCICIO", _
                  "FRACIONAMENTO", "BENFORD D2", "USUARIOS", "ESTORNO RELANC", _
                  "DASHBOARD", "RESUMO")
    Dim n As Variant
    For Each n In nomes
        Application.DisplayAlerts = False
        If AbaExiste(CStr(n)) Then Sheets(CStr(n)).Delete
        Application.DisplayAlerts = True
        Dim ws As Worksheet
        Set ws = Sheets.Add(After:=Sheets(Sheets.Count))
        ws.Name = CStr(n)
    Next n

End Sub

' ============================================================
' ANÁLISE 1 — CLASSIFICAÇÃO CAPEX/OPEX/INELEGÍVEL
' ============================================================
Sub GerarClassificacao()

    Dim wsDados As Worksheet, wsOut As Worksheet
    Set wsDados = Sheets("DADOS")
    Set wsOut = Sheets("CLASSIFICACAO")

    Dim cab As Variant
    cab = Array("PEP", "CLASSE_CUSTO", "DESC_CLASSE_CUSTO", "MATERIAL", _
                "TEXTO_MATERIAL", "VALOR_MOEDA", "TIPO_APLICACAO", _
                "CLASS_BRR", "ELEGIBILIDADE", "RISCO", "OBSERVACAO")
    Dim k As Integer
    For k = 0 To UBound(cab): wsOut.Cells(1, k + 1).Value = cab(k): Next k
    CabecalhoFormatar wsOut, 1, UBound(cab) + 1, RGB(31, 78, 121)

    Dim i As Long, linOut As Long
    linOut = 2
    Dim cl As String, de As String, ma As String, tx As String, ta As String
    Dim vl As Double, cls As String, ele As String, ris As String

    For i = 2 To ultimaLinha
        If Trim(wsDados.Cells(i, colPEP).Value) = "" Then GoTo Prox1
        cl = IIf(colCLASSE > 0, UCase(Trim(wsDados.Cells(i, colCLASSE).Value)), "")
        de = IIf(colDESC > 0, UCase(Trim(wsDados.Cells(i, colDESC).Value)), "")
        ma = IIf(colMATERIAL > 0, Trim(wsDados.Cells(i, colMATERIAL).Value), "")
        tx = IIf(colTEXTO > 0, UCase(Trim(wsDados.Cells(i, colTEXTO).Value)), "")
        ta = IIf(colTIPOAPL > 0, UCase(Trim(wsDados.Cells(i, colTIPOAPL).Value)), "")
        vl = IIf(colVALOR > 0, Val(wsDados.Cells(i, colVALOR).Value), 0)

        ClassificarLinha de & " " & tx & " " & cl, ma, ta, cls, ele, ris

        wsOut.Cells(linOut, 1).Value = wsDados.Cells(i, colPEP).Value
        wsOut.Cells(linOut, 2).Value = IIf(colCLASSE > 0, wsDados.Cells(i, colCLASSE).Value, "")
        wsOut.Cells(linOut, 3).Value = IIf(colDESC > 0, wsDados.Cells(i, colDESC).Value, "")
        wsOut.Cells(linOut, 4).Value = ma
        wsOut.Cells(linOut, 5).Value = IIf(colTEXTO > 0, wsDados.Cells(i, colTEXTO).Value, "")
        wsOut.Cells(linOut, 6).Value = vl
        wsOut.Cells(linOut, 6).NumberFormat = "R$ #,##0.00"
        wsOut.Cells(linOut, 7).Value = ta
        wsOut.Cells(linOut, 8).Value = cls
        wsOut.Cells(linOut, 9).Value = ele
        wsOut.Cells(linOut, 10).Value = ris
        wsOut.Cells(linOut, 11).Value = ObjClass(cls)

        Dim cor As Long
        Select Case ele
            Case "CAPEX BRR ALTO":  cor = RGB(198, 239, 206)
            Case "CAPEX BRR MÉDIO": cor = RGB(255, 235, 156)
            Case "OPEX":            cor = RGB(255, 199, 206)
            Case "INELEGÍVEL BRR":  cor = RGB(255, 100, 100)
            Case Else:              cor = RGB(242, 242, 242)
        End Select
        wsOut.Range(wsOut.Cells(linOut, 8), wsOut.Cells(linOut, 10)).Interior.Color = cor

        linOut = linOut + 1
Prox1:
    Next i
    wsOut.Columns("A:K").AutoFit

End Sub

Sub ClassificarLinha(texto As String, material As String, tipoApl As String, _
                     ByRef cls As String, ByRef ele As String, ByRef ris As String)

    If Tem(texto, Array("MARKETING", "PROPAGANDA", "PATROCIN", "DOACAO", "DOAÇÃO", _
                        "MULTA", "PENALIDADE", "INDENIZACAO", "INDENIZAÇÃO")) Then
        cls = "INELEGÍVEL BRR": ele = "INELEGÍVEL BRR": ris = "GLOSA INTEGRAL": Exit Sub
    End If
    If Tem(texto, Array("ALIMENTAC", "REFEIC", "DIARIA", "DIÁRIA", "HOSPEDAGEM")) Then
        cls = "ALIMENTAÇÃO/VIAGEM": ele = "INELEGÍVEL BRR": ris = "GLOSA POTENCIAL": Exit Sub
    End If
    If (material = "" Or material = "0") And UCase(tipoApl) = "CAPEX" Then
        cls = "SEM CÓDIGO MATERIAL": ele = "ESPECIAL": ris = "GLOSA POTENCIAL - SEM TUC": Exit Sub
    End If
    If UCase(tipoApl) = "OPEX" Or Tem(texto, Array("MANUTENCAO", "MANUTENÇÃO", "O&M")) Then
        cls = "OPEX": ele = "OPEX": ris = "INELEGÍVEL BRR": Exit Sub
    End If
    If Tem(texto, Array("CABO", "CONDUTOR", "TRANSFORMADOR", "POSTE", "MEDIDOR", _
                        "DISJUNTOR", "CHAVE", "RELIGADOR", "ISOLADOR", "CRUZETA", _
                        "FERRAGEM", "MONTAGEM ELETRICA", "MONTAGEM ELÉTRICA", _
                        "OBRA CIVIL", "ESTRUTURA")) Then
        cls = "CAPEX BRR ALTO": ele = "CAPEX BRR ALTO": ris = "ELEGÍVEL": Exit Sub
    End If
    If Tem(texto, Array("CANTEIRO", "ADMINISTRACAO", "ADMINISTRAÇÃO", "MOBILIZAC", _
                        "TELECOM", "TRIBUTO", "ISSQN", "JOA", "EFT", _
                        "ENCARGO FINANC", "JURO", "ENGENHARIA", "PROJETO")) Then
        cls = "CAPEX BRR MÉDIO": ele = "CAPEX BRR MÉDIO": ris = "ELEGÍVEL PARCIAL": Exit Sub
    End If
    If Tem(texto, Array("FOLHA", "SALARIO", "SALÁRIO", "SOFTWARE", "HARDWARE", _
                        "COMPUTADOR", "VEICULO", "VEÍCULO", "MOVEL", "MÓVEL")) Then
        cls = "OPEX BAIXO": ele = "OPEX": ris = "INELEGÍVEL BRR": Exit Sub
    End If
    cls = "VERIFICAR": ele = "VERIFICAR": ris = "ANÁLISE MANUAL"

End Sub

Function ObjClass(cls As String) As String
    Select Case cls
        Case "INELEGÍVEL BRR":      ObjClass = "Glosa integral — REN 396/2010"
        Case "ALIMENTAÇÃO/VIAGEM":  ObjClass = "Verificar vínculo com equipe de campo"
        Case "SEM CÓDIGO MATERIAL": ObjClass = "Risco MCPSE — sem TUC → possível glosa"
        Case "CAPEX BRR ALTO":      ObjClass = "Elegível pleno — PRORET 2.3"
        Case "CAPEX BRR MÉDIO":     ObjClass = "Elegível parcial — verificar ATV DRT e JOA"
        Case "OPEX BAIXO":          ObjClass = "OPEX legítimo — inelegível BRR"
        Case "OPEX":                ObjClass = "OPEX lançado em PEP — verificar"
        Case Else:                  ObjClass = "Verificar manualmente"
    End Select
End Function

' ============================================================
' ANÁLISE 2 — DUPLICIDADES
' ============================================================
Sub AnalisarDuplicidades()

    Dim wsDados As Worksheet, wsOut As Worksheet
    Set wsDados = Sheets("DADOS"): Set wsOut = Sheets("DUPLICIDADES")

    Dim cab As Variant
    cab = Array("PEP", "NUM_DOC", "MATERIAL", "VALOR", "DATA_LANC_1", "DATA_LANC_2", "DIAS", "CLASSIFICACAO", "VALOR_DUPLICADO")
    Dim k As Integer
    For k = 0 To UBound(cab): wsOut.Cells(1, k + 1).Value = cab(k): Next k
    CabecalhoFormatar wsOut, 1, UBound(cab) + 1, RGB(155, 0, 0)

    Dim dict As Object
    Set dict = CreateObject("Scripting.Dictionary")
    Dim i As Long, linOut As Long
    linOut = 2

    For i = 2 To ultimaLinha
        Dim pep As String, ndoc As String, mat As String
        Dim vl As Double, dlc As Variant
        pep = Trim(wsDados.Cells(i, colPEP).Value)
        If pep = "" Then GoTo Prox2
        vl = IIf(colVALOR > 0, Val(wsDados.Cells(i, colVALOR).Value), 0)
        If vl <= 0 Then GoTo Prox2   ' ignora estornos
        ndoc = IIf(colNUMDOC > 0, Trim(wsDados.Cells(i, colNUMDOC).Value), "")
        mat  = IIf(colMATERIAL > 0, Trim(wsDados.Cells(i, colMATERIAL).Value), "")
        dlc  = IIf(colDATALANC > 0, wsDados.Cells(i, colDATALANC).Value, 0)

        If ndoc = "" Then GoTo Prox2

        Dim chave As String
        chave = pep & "|" & ndoc & "|" & Format(vl, "0.00")

        If dict.Exists(chave) Then
            Dim linAnt As Long: linAnt = dict(chave)
            Dim dlcAnt As Variant
            dlcAnt = IIf(colDATALANC > 0, wsDados.Cells(linAnt, colDATALANC).Value, 0)
            Dim dif As Long: dif = 0
            If IsDate(dlc) And IsDate(dlcAnt) Then dif = Abs(CDate(dlc) - CDate(dlcAnt))

            Dim cat As String
            If dif = 0 Then:   cat = "DUPLICIDADE CRÍTICA"
            ElseIf dif <= 30:  cat = "PROVÁVEL DUPLICIDADE"
            ElseIf dif <= 90:  cat = "POSSÍVEL DUPLICIDADE"
            Else:               cat = "VERIFICAR — INTERVALO LONGO"
            End If

            wsOut.Cells(linOut, 1).Value = pep
            wsOut.Cells(linOut, 2).Value = ndoc
            wsOut.Cells(linOut, 3).Value = mat
            wsOut.Cells(linOut, 4).Value = vl:       wsOut.Cells(linOut, 4).NumberFormat = "R$ #,##0.00"
            wsOut.Cells(linOut, 5).Value = dlcAnt
            wsOut.Cells(linOut, 6).Value = dlc
            wsOut.Cells(linOut, 7).Value = dif
            wsOut.Cells(linOut, 8).Value = cat
            wsOut.Cells(linOut, 9).Value = vl:       wsOut.Cells(linOut, 9).NumberFormat = "R$ #,##0.00"

            Select Case cat
                Case "DUPLICIDADE CRÍTICA":   wsOut.Rows(linOut).Interior.Color = RGB(255, 100, 100)
                Case "PROVÁVEL DUPLICIDADE":  wsOut.Rows(linOut).Interior.Color = RGB(255, 165, 0)
                Case Else:                    wsOut.Rows(linOut).Interior.Color = RGB(255, 235, 156)
            End Select
            linOut = linOut + 1
        Else
            dict.Add chave, i
        End If
Prox2:
    Next i

    If linOut > 2 Then
        wsOut.Cells(linOut + 1, 8).Value = "TOTAL DUPLICADO:"
        wsOut.Cells(linOut + 1, 8).Font.Bold = True
        wsOut.Cells(linOut + 1, 9).Formula = "=SUM(I2:I" & (linOut - 1) & ")"
        wsOut.Cells(linOut + 1, 9).NumberFormat = "R$ #,##0.00"
        wsOut.Cells(linOut + 1, 9).Font.Bold = True
    End If
    wsOut.Columns("A:I").AutoFit

End Sub

' ============================================================
' ANÁLISE 3 — ATV DRT (Custos Administrativos)
' ============================================================
Sub AnalisarATVDRT()

    Dim wsDados As Worksheet, wsOut As Worksheet
    Set wsDados = Sheets("DADOS"): Set wsOut = Sheets("ATV_DRT")

    Dim cab As Variant
    cab = Array("PEP", "DENOMINACAO", "CUSTO_DIRETO", "CUSTO_ADM", "ATV_DRT_%", "CLASSIFICACAO", "GLOSA_ESTIMADA")
    Dim k As Integer
    For k = 0 To UBound(cab): wsOut.Cells(1, k + 1).Value = cab(k): Next k
    CabecalhoFormatar wsOut, 1, UBound(cab) + 1, RGB(84, 130, 53)

    Dim dDir As Object, dAdm As Object, dDen As Object
    Set dDir = CreateObject("Scripting.Dictionary")
    Set dAdm = CreateObject("Scripting.Dictionary")
    Set dDen = CreateObject("Scripting.Dictionary")

    Dim i As Long
    For i = 2 To ultimaLinha
        Dim pep As String, de As String, vl As Double, dn As String
        pep = Trim(wsDados.Cells(i, colPEP).Value)
        If pep = "" Then GoTo Prox3
        vl = IIf(colVALOR > 0, Val(wsDados.Cells(i, colVALOR).Value), 0)
        If vl <= 0 Then GoTo Prox3
        de = IIf(colDESC > 0, UCase(Trim(wsDados.Cells(i, colDESC).Value)), "")
        dn = IIf(colDENOM > 0, Trim(wsDados.Cells(i, colDENOM).Value), "")

        If Not dDir.Exists(pep) Then
            dDir.Add pep, 0: dAdm.Add pep, 0: dDen.Add pep, dn
        End If

        If Tem(de, Array("CANTEIRO", "ADMINISTRAC", "MOBILIZAC", "SERVICO GERAL", _
                         "SERVIÇO GERAL", "ALIMENTAC")) Then
            dAdm(pep) = dAdm(pep) + vl
        Else
            dDir(pep) = dDir(pep) + vl
        End If
Prox3:
    Next i

    Dim linOut As Long: linOut = 2
    Dim pk As Variant
    For Each pk In dDir.Keys
        Dim cd As Double, ca As Double, rat As Double, glosa As Double, cat As String
        cd = dDir(pk): ca = dAdm(pk)
        rat = IIf(cd > 0, ca / cd, 0)
        glosa = 0

        If rat > ATV_DRT_CRITICO Then
            cat = "CRÍTICO EXTREMO (>100%)": glosa = ca - cd * ATV_DRT_LIMITE
            wsOut.Rows(linOut).Interior.Color = RGB(255, 100, 100)
        ElseIf rat > ATV_DRT_ANOMALIA Then
            cat = "GRAVE (50–100%)":         glosa = ca - cd * ATV_DRT_LIMITE
            wsOut.Rows(linOut).Interior.Color = RGB(255, 165, 0)
        ElseIf rat > ATV_DRT_LIMITE Then
            cat = "ANOMALIA (25–50%)":       glosa = ca - cd * ATV_DRT_LIMITE
            wsOut.Rows(linOut).Interior.Color = RGB(255, 235, 156)
        Else
            cat = "NORMAL (≤25%)"
            wsOut.Rows(linOut).Interior.Color = RGB(198, 239, 206)
        End If

        wsOut.Cells(linOut, 1).Value = pk
        wsOut.Cells(linOut, 2).Value = dDen(pk)
        wsOut.Cells(linOut, 3).Value = cd:            wsOut.Cells(linOut, 3).NumberFormat = "R$ #,##0.00"
        wsOut.Cells(linOut, 4).Value = ca:            wsOut.Cells(linOut, 4).NumberFormat = "R$ #,##0.00"
        wsOut.Cells(linOut, 5).Value = rat:           wsOut.Cells(linOut, 5).NumberFormat = "0.0%"
        wsOut.Cells(linOut, 6).Value = cat
        wsOut.Cells(linOut, 7).Value = IIf(glosa > 0, glosa, 0)
        wsOut.Cells(linOut, 7).NumberFormat = "R$ #,##0.00"
        linOut = linOut + 1
    Next pk
    wsOut.Columns("A:G").AutoFit

End Sub

' ============================================================
' ANÁLISE 4 — RETROATIVOS (CPC 23)
' ============================================================
Sub AnalisarRetroativos()

    Dim wsDados As Worksheet, wsOut As Worksheet
    Set wsDados = Sheets("DADOS"): Set wsOut = Sheets("RETROATIVOS")

    Dim cab As Variant
    cab = Array("PEP", "NUM_DOC", "DATA_DOCUMENTO", "DATA_LANCAMENTO", "DIAS_DEFASAGEM", "VALOR", "CLASSIFICACAO")
    Dim k As Integer
    For k = 0 To UBound(cab): wsOut.Cells(1, k + 1).Value = cab(k): Next k
    CabecalhoFormatar wsOut, 1, UBound(cab) + 1, RGB(112, 48, 160)

    If colDATALANC = 0 Or colDATADOC = 0 Then
        wsOut.Cells(2, 1).Value = "Colunas DATA_LANCAMENTO e/ou DATA_DOCUMENTO não encontradas na base."
        Exit Sub
    End If

    Dim i As Long, linOut As Long: linOut = 2
    For i = 2 To ultimaLinha
        Dim pep As String, dlc As Variant, ddc As Variant, vl As Double, dif As Long
        pep = Trim(wsDados.Cells(i, colPEP).Value)
        If pep = "" Then GoTo Prox4
        dlc = wsDados.Cells(i, colDATALANC).Value
        ddc = wsDados.Cells(i, colDATADOC).Value
        If Not IsDate(dlc) Or Not IsDate(ddc) Then GoTo Prox4
        dif = CDate(dlc) - CDate(ddc)
        If dif < 0 Then dif = 0
        If dif <= RETRO_OK Then GoTo Prox4
        vl = IIf(colVALOR > 0, Val(wsDados.Cells(i, colVALOR).Value), 0)

        Dim cat As String
        If dif > RETRO_CRITICO Then
            cat = "CRÍTICO (>12 meses)":      wsOut.Rows(linOut).Interior.Color = RGB(255, 100, 100)
        ElseIf dif > 180 Then
            cat = "GRAVE (6–12 meses)":       wsOut.Rows(linOut).Interior.Color = RGB(255, 165, 0)
        Else
            cat = "ATENÇÃO (90–180 dias)":    wsOut.Rows(linOut).Interior.Color = RGB(255, 235, 156)
        End If

        wsOut.Cells(linOut, 1).Value = pep
        wsOut.Cells(linOut, 2).Value = IIf(colNUMDOC > 0, wsDados.Cells(i, colNUMDOC).Value, "")
        wsOut.Cells(linOut, 3).Value = ddc
        wsOut.Cells(linOut, 4).Value = dlc
        wsOut.Cells(linOut, 5).Value = dif
        wsOut.Cells(linOut, 6).Value = vl: wsOut.Cells(linOut, 6).NumberFormat = "R$ #,##0.00"
        wsOut.Cells(linOut, 7).Value = cat
        linOut = linOut + 1
Prox4:
    Next i
    wsOut.Columns("A:G").AutoFit

End Sub

' ============================================================
' ANÁLISE 5 — ESTORNOS
' ============================================================
Sub AnalisarEstornos()

    Dim wsDados As Worksheet, wsOut As Worksheet
    Set wsDados = Sheets("DADOS"): Set wsOut = Sheets("ESTORNOS")

    Dim cab As Variant
    cab = Array("PEP", "DENOMINACAO", "TOTAL_POSITIVO", "TOTAL_ESTORNOS", "RATIO_%", "SALDO_LIQUIDO", "CLASSIFICACAO")
    Dim k As Integer
    For k = 0 To UBound(cab): wsOut.Cells(1, k + 1).Value = cab(k): Next k
    CabecalhoFormatar wsOut, 1, UBound(cab) + 1, RGB(197, 90, 17)

    Dim dPos As Object, dNeg As Object, dDen As Object
    Set dPos = CreateObject("Scripting.Dictionary")
    Set dNeg = CreateObject("Scripting.Dictionary")
    Set dDen = CreateObject("Scripting.Dictionary")

    Dim i As Long
    For i = 2 To ultimaLinha
        Dim pep As String, vl As Double, dn As String
        pep = Trim(wsDados.Cells(i, colPEP).Value)
        If pep = "" Then GoTo Prox5
        vl = IIf(colVALOR > 0, Val(wsDados.Cells(i, colVALOR).Value), 0)
        dn = IIf(colDENOM > 0, Trim(wsDados.Cells(i, colDENOM).Value), "")
        If Not dPos.Exists(pep) Then
            dPos.Add pep, 0: dNeg.Add pep, 0: dDen.Add pep, dn
        End If
        If vl > 0 Then: dPos(pep) = dPos(pep) + vl
        ElseIf vl < 0 Then: dNeg(pep) = dNeg(pep) + Abs(vl)
        End If
Prox5:
    Next i

    Dim linOut As Long: linOut = 2
    Dim pk As Variant
    Dim totPos As Double, totEst As Double
    totPos = 0: totEst = 0

    For Each pk In dPos.Keys
        Dim tp As Double, tn As Double, rat As Double
        tp = dPos(pk): tn = dNeg(pk)
        totPos = totPos + tp: totEst = totEst + tn
        rat = IIf(tp > 0, tn / tp, 0)

        Dim cat As String
        If rat > ESTORNO_ANOMALO Then
            cat = "ANÔMALO (>20%)":    wsOut.Rows(linOut).Interior.Color = RGB(255, 100, 100)
        ElseIf rat > ESTORNO_ATENCAO Then
            cat = "ATENÇÃO (5–20%)":   wsOut.Rows(linOut).Interior.Color = RGB(255, 235, 156)
        Else
            cat = "NORMAL (≤5%)"
        End If

        wsOut.Cells(linOut, 1).Value = pk
        wsOut.Cells(linOut, 2).Value = dDen(pk)
        wsOut.Cells(linOut, 3).Value = tp:     wsOut.Cells(linOut, 3).NumberFormat = "R$ #,##0.00"
        wsOut.Cells(linOut, 4).Value = tn:     wsOut.Cells(linOut, 4).NumberFormat = "R$ #,##0.00"
        wsOut.Cells(linOut, 5).Value = rat:    wsOut.Cells(linOut, 5).NumberFormat = "0.0%"
        wsOut.Cells(linOut, 6).Value = tp - tn: wsOut.Cells(linOut, 6).NumberFormat = "R$ #,##0.00"
        wsOut.Cells(linOut, 7).Value = cat
        linOut = linOut + 1
    Next pk

    wsOut.Cells(linOut + 1, 1).Value = "RATIO GLOBAL DE ESTORNOS:"
    wsOut.Cells(linOut + 1, 1).Font.Bold = True
    wsOut.Cells(linOut + 1, 5).Value = IIf(totPos > 0, totEst / totPos, 0)
    wsOut.Cells(linOut + 1, 5).NumberFormat = "0.0%"
    wsOut.Cells(linOut + 1, 5).Font.Bold = True
    wsOut.Columns("A:G").AutoFit

End Sub

' ============================================================
' ANÁLISE 6 — FORNECEDORES (Pareto + Concentração)
' ============================================================
Sub AnalisarFornecedores()

    Dim wsDados As Worksheet, wsOut As Worksheet
    Set wsDados = Sheets("DADOS"): Set wsOut = Sheets("FORNECEDORES")

    Dim cab As Variant
    cab = Array("FORNECEDOR_PROXY", "VALOR_TOTAL", "N_DOCUMENTOS", "PARTICIPACAO_%", "CLASSIFICACAO")
    Dim k As Integer
    For k = 0 To UBound(cab): wsOut.Cells(1, k + 1).Value = cab(k): Next k
    CabecalhoFormatar wsOut, 1, UBound(cab) + 1, RGB(0, 112, 192)

    ' Procurar coluna de fornecedor (FORNECEDOR, NOME_FORNECEDOR, RAZAO_SOCIAL)
    Dim colForn As Integer: colForn = 0
    Dim j As Integer
    For j = 1 To wsDados.Cells(1, wsDados.Columns.Count).End(xlToLeft).Column
        Select Case UCase(Trim(wsDados.Cells(1, j).Value))
            Case "FORNECEDOR", "NOME_FORNECEDOR", "RAZAO_SOCIAL": colForn = j: Exit For
        End Select
    Next j
    If colForn = 0 Then colForn = colUSUARIO  ' fallback

    Dim dVal As Object, dCnt As Object
    Set dVal = CreateObject("Scripting.Dictionary")
    Set dCnt = CreateObject("Scripting.Dictionary")
    Dim totalGeral As Double: totalGeral = 0

    Dim i As Long
    For i = 2 To ultimaLinha
        Dim pep As String, vl As Double, fn As String
        pep = Trim(wsDados.Cells(i, colPEP).Value)
        If pep = "" Then GoTo Prox6
        vl = IIf(colVALOR > 0, Val(wsDados.Cells(i, colVALOR).Value), 0)
        If vl <= 0 Then GoTo Prox6
        fn = IIf(colForn > 0, Trim(wsDados.Cells(i, colForn).Value), "NÃO IDENTIFICADO")
        If fn = "" Then fn = "NÃO IDENTIFICADO"
        If Not dVal.Exists(fn) Then dVal.Add fn, 0: dCnt.Add fn, 0
        dVal(fn) = dVal(fn) + vl: dCnt(fn) = dCnt(fn) + 1
        totalGeral = totalGeral + vl
Prox6:
    Next i

    ' Ordenar por valor decrescente (bubble sort)
    Dim n As Integer: n = dVal.Count
    Dim aFn() As String: ReDim aFn(n - 1)
    Dim aVl() As Double: ReDim aVl(n - 1)
    Dim idx As Integer: idx = 0
    Dim fk As Variant
    For Each fk In dVal.Keys: aFn(idx) = CStr(fk): aVl(idx) = dVal(fk): idx = idx + 1: Next fk

    Dim a As Integer, b As Integer, ts As String, td As Double
    For a = 0 To n - 2
        For b = a + 1 To n - 1
            If aVl(a) < aVl(b) Then
                td = aVl(a): aVl(a) = aVl(b): aVl(b) = td
                ts = aFn(a): aFn(a) = aFn(b): aFn(b) = ts
            End If
        Next b
    Next a

    Dim linOut As Long: linOut = 2
    Dim top3 As Double: top3 = 0
    For idx = 0 To n - 1
        Dim part As Double
        part = IIf(totalGeral > 0, aVl(idx) / totalGeral, 0)
        If idx < 3 Then top3 = top3 + part
        Dim cat As String
        cat = IIf(idx < 3, "TOP " & (idx + 1), "")
        wsOut.Cells(linOut, 1).Value = aFn(idx)
        wsOut.Cells(linOut, 2).Value = aVl(idx):   wsOut.Cells(linOut, 2).NumberFormat = "R$ #,##0.00"
        wsOut.Cells(linOut, 3).Value = dCnt(aFn(idx))
        wsOut.Cells(linOut, 4).Value = part:        wsOut.Cells(linOut, 4).NumberFormat = "0.0%"
        wsOut.Cells(linOut, 5).Value = cat
        If idx < 3 Then wsOut.Rows(linOut).Interior.Color = RGB(255, 235, 156)
        linOut = linOut + 1
    Next idx

    linOut = linOut + 1
    wsOut.Cells(linOut, 1).Value = "CONCENTRAÇÃO TOP 3:"
    wsOut.Cells(linOut, 1).Font.Bold = True
    wsOut.Cells(linOut, 4).Value = top3: wsOut.Cells(linOut, 4).NumberFormat = "0.0%": wsOut.Cells(linOut, 4).Font.Bold = True
    Dim catC As String, corC As Long
    If top3 > CONC_CRITICO Then: catC = "CRÍTICO (>70%)":  corC = RGB(255, 100, 100)
    ElseIf top3 > CONC_LIMITE Then: catC = "ATENÇÃO (50–70%)": corC = RGB(255, 165, 0)
    Else: catC = "NORMAL (≤50%)":  corC = RGB(198, 239, 206)
    End If
    wsOut.Cells(linOut, 5).Value = catC: wsOut.Cells(linOut, 5).Font.Bold = True
    wsOut.Cells(linOut, 5).Interior.Color = corC
    wsOut.Columns("A:E").AutoFit

End Sub

' ============================================================
' ANÁLISE 7 — LEI DE BENFORD (MAD — Nigrini 2012)
' ============================================================
Sub AnalisarBenford()

    Dim wsDados As Worksheet, wsOut As Worksheet
    Set wsDados = Sheets("DADOS"): Set wsOut = Sheets("BENFORD")

    Dim esp(1 To 9) As Double
    Dim d As Integer
    For d = 1 To 9: esp(d) = Log(1 + 1# / d) / Log(10): Next d

    Dim cnt(1 To 9) As Long, tot As Long: tot = 0
    Dim i As Long
    For i = 2 To ultimaLinha
        Dim vl As Double
        vl = IIf(colVALOR > 0, Val(wsDados.Cells(i, colVALOR).Value), 0)
        If vl <= 0 Then GoTo Prox7
        Dim sv As String: sv = Format(Abs(vl), "0")
        Dim pd As Integer: pd = Val(Left(sv, 1))
        If pd >= 1 And pd <= 9 Then cnt(pd) = cnt(pd) + 1: tot = tot + 1
Prox7:
    Next i

    wsOut.Cells(1, 1).Value = "DÍGITO": wsOut.Cells(1, 2).Value = "FREQ_OBSERVADA"
    wsOut.Cells(1, 3).Value = "FREQ_ESPERADA": wsOut.Cells(1, 4).Value = "DIFERENÇA"
    wsOut.Cells(1, 5).Value = "ABS_DIF"
    CabecalhoFormatar wsOut, 1, 5, RGB(68, 114, 196)

    Dim somaAbs As Double: somaAbs = 0
    For d = 1 To 9
        Dim fo As Double: fo = IIf(tot > 0, cnt(d) / tot, 0)
        Dim dif As Double: dif = fo - esp(d)
        wsOut.Cells(d + 1, 1).Value = d
        wsOut.Cells(d + 1, 2).Value = fo:       wsOut.Cells(d + 1, 2).NumberFormat = "0.000%"
        wsOut.Cells(d + 1, 3).Value = esp(d):   wsOut.Cells(d + 1, 3).NumberFormat = "0.000%"
        wsOut.Cells(d + 1, 4).Value = dif:      wsOut.Cells(d + 1, 4).NumberFormat = "0.000%"
        wsOut.Cells(d + 1, 5).Value = Abs(dif): wsOut.Cells(d + 1, 5).NumberFormat = "0.000%"
        somaAbs = somaAbs + Abs(dif)
    Next d

    Dim MAD As Double: MAD = (somaAbs / 9) * 100  ' converter para pp (escala Nigrini)
    Dim catB As String, corB As Long
    If MAD < BENFORD_CONF Then:   catB = "CONFORMIDADE":              corB = RGB(198, 239, 206)
    ElseIf MAD < BENFORD_ACEIT Then: catB = "ACEITÁVEL":              corB = RGB(255, 235, 156)
    ElseIf MAD < BENFORD_LEVE Then:  catB = "LEVE NÃO-CONFORMIDADE":  corB = RGB(255, 165, 0)
    Else:                            catB = "NÃO-CONFORMIDADE — INVESTIGAR": corB = RGB(255, 100, 100)
    End If

    wsOut.Cells(12, 1).Value = "MAD (Nigrini 2012):": wsOut.Cells(12, 1).Font.Bold = True
    wsOut.Cells(12, 2).Value = MAD:   wsOut.Cells(12, 2).NumberFormat = "0.000": wsOut.Cells(12, 2).Font.Bold = True
    wsOut.Cells(12, 3).Value = catB:  wsOut.Cells(12, 3).Font.Bold = True
    wsOut.Range("A12:C12").Interior.Color = corB
    wsOut.Cells(13, 1).Value = "Lançamentos analisados: " & tot
    wsOut.Cells(15, 1).Value = "AVISO: MAD elevado NÃO é prova de fraude — justifica investigação adicional (Nigrini 2012)"
    wsOut.Cells(15, 1).Font.Italic = True: wsOut.Cells(15, 1).Font.Color = RGB(128, 0, 0)
    wsOut.Columns("A:E").AutoFit

End Sub

' ============================================================
' ANÁLISE 8 — SOBREPREÇO / BPR ±10%
' ============================================================
Sub AnalisarSobrepreco()

    Dim wsDados As Worksheet, wsOut As Worksheet
    Set wsDados = Sheets("DADOS"): Set wsOut = Sheets("SOBREPRECO")

    Dim cab As Variant
    cab = Array("MATERIAL", "UML", "N_OCORRENCIAS", "PU_MEDIANA", "PU_MAXIMO", "DESVIO_MAX_%", "CLASSIFICACAO", "GLOSA_UNITARIA_EST")
    Dim k As Integer
    For k = 0 To UBound(cab): wsOut.Cells(1, k + 1).Value = cab(k): Next k
    CabecalhoFormatar wsOut, 1, UBound(cab) + 1, RGB(192, 0, 0)

    If colQTD = 0 Then
        wsOut.Cells(2, 1).Value = "Coluna QTD_ENTRADA não encontrada. Para análise de preço unitário adicione esta coluna."
        wsOut.Cells(3, 1).Value = "Para aplicação da regra BPR ±10%, adicione coluna VNR com o preço de referência ANEEL."
        wsOut.Columns("A:H").AutoFit: Exit Sub
    End If

    Dim dPUs As Object
    Set dPUs = CreateObject("Scripting.Dictionary")

    Dim i As Long
    For i = 2 To ultimaLinha
        Dim mat As String, uml As String, qtd As Double, vl As Double, pu As Double
        mat = IIf(colMATERIAL > 0, Trim(wsDados.Cells(i, colMATERIAL).Value), "")
        If mat = "" Then GoTo Prox8
        qtd = IIf(colQTD > 0, Val(wsDados.Cells(i, colQTD).Value), 0)
        vl  = IIf(colVALOR > 0, Val(wsDados.Cells(i, colVALOR).Value), 0)
        uml = IIf(colUML > 0, Trim(wsDados.Cells(i, colUML).Value), "")
        If qtd <= 0 Or vl <= 0 Then GoTo Prox8
        pu = vl / qtd
        Dim chv As String: chv = mat & "|" & uml
        If Not dPUs.Exists(chv) Then dPUs.Add chv, ""
        dPUs(chv) = IIf(dPUs(chv) = "", CStr(pu), dPUs(chv) & "|" & CStr(pu))
Prox8:
    Next i

    Dim linOut As Long: linOut = 2
    Dim mk As Variant
    For Each mk In dPUs.Keys
        Dim puArr() As String: puArr = Split(CStr(dPUs(mk)), "|")
        Dim nn As Integer: nn = UBound(puArr) + 1
        If nn < 2 Then GoTo ProxMat   ' sem benchmark interno
        Dim puD() As Double: ReDim puD(nn - 1)
        Dim x As Integer
        For x = 0 To nn - 1: puD(x) = Val(puArr(x)): Next x
        ' Ordenar
        Dim a As Integer, b As Integer, td As Double
        For a = 0 To nn - 2
            For b = a + 1 To nn - 1
                If puD(a) > puD(b) Then td = puD(a): puD(a) = puD(b): puD(b) = td
            Next b
        Next a
        Dim med As Double
        med = IIf(nn Mod 2 = 1, puD(nn \ 2), (puD(nn \ 2 - 1) + puD(nn \ 2)) / 2)
        If med <= 0 Then GoTo ProxMat
        Dim puMax As Double: puMax = puD(nn - 1)
        Dim desv As Double:  desv = (puMax - med) / med
        If Abs(desv) <= BPR_TOLERANCIA Then GoTo ProxMat  ' dentro do ±10%

        Dim parts() As String: parts = Split(CStr(mk), "|")
        Dim cat As String, corR As Long
        If desv > 0.5 Then:      cat = "RISCO REGULATÓRIO (>50%)": corR = RGB(255, 100, 100)
        ElseIf desv > 0.2 Then:  cat = "INDÍCIO (20–50%)":          corR = RGB(255, 165, 0)
        Else:                    cat = "ATENÇÃO (10–20%)":           corR = RGB(255, 235, 156)
        End If

        Dim glosa As Double: glosa = IIf(desv > BPR_TOLERANCIA, puMax - med * (1 + BPR_TOLERANCIA), 0)

        wsOut.Cells(linOut, 1).Value = parts(0)
        wsOut.Cells(linOut, 2).Value = IIf(UBound(parts) > 0, parts(1), "")
        wsOut.Cells(linOut, 3).Value = nn
        wsOut.Cells(linOut, 4).Value = med:   wsOut.Cells(linOut, 4).NumberFormat = "R$ #,##0.00"
        wsOut.Cells(linOut, 5).Value = puMax: wsOut.Cells(linOut, 5).NumberFormat = "R$ #,##0.00"
        wsOut.Cells(linOut, 6).Value = desv:  wsOut.Cells(linOut, 6).NumberFormat = "0.0%"
        wsOut.Cells(linOut, 7).Value = cat
        wsOut.Cells(linOut, 8).Value = IIf(glosa > 0, glosa, 0): wsOut.Cells(linOut, 8).NumberFormat = "R$ #,##0.00"
        wsOut.Rows(linOut).Interior.Color = corR
        linOut = linOut + 1
ProxMat:
    Next mk

    wsOut.Cells(linOut + 2, 1).Value = "NOTA: Análise usa mediana interna como proxy do VNR. Para aplicar BPR exato, adicione coluna VNR."
    wsOut.Cells(linOut + 2, 1).Font.Italic = True: wsOut.Cells(linOut + 2, 1).Font.Size = 9
    wsOut.Columns("A:H").AutoFit

End Sub

' ============================================================
' SCORE DE COMPLIANCE (0–100)
' ============================================================
Function CalcularScore() As Double
    Dim sc As Double: sc = 100

    ' Duplicidades (–até 15)
    If AbaExiste("DUPLICIDADES") Then
        Dim n As Long: n = Sheets("DUPLICIDADES").Cells(Sheets("DUPLICIDADES").Rows.Count, 1).End(xlUp).Row - 1
        sc = sc - WorksheetFunction.Min(15, n * 2)
    End If

    ' ATV DRT (–até 20)
    If AbaExiste("ATV_DRT") Then
        Dim wsA As Worksheet: Set wsA = Sheets("ATV_DRT")
        Dim r As Long
        For r = 2 To wsA.Cells(wsA.Rows.Count, 1).End(xlUp).Row
            Dim c6 As String: c6 = wsA.Cells(r, 6).Value
            If InStr(c6, "CRÍTICO") > 0 Then sc = sc - 5
            If InStr(c6, "GRAVE") > 0 Then sc = sc - 3
            If InStr(c6, "ANOMALIA") > 0 Then sc = sc - 1
        Next r
    End If

    ' Retroativos (–até 10)
    If AbaExiste("RETROATIVOS") Then
        Dim nR As Long: nR = Sheets("RETROATIVOS").Cells(Sheets("RETROATIVOS").Rows.Count, 1).End(xlUp).Row - 1
        sc = sc - WorksheetFunction.Min(10, nR * 1)
    End If

    ' Benford (–até 5)
    If AbaExiste("BENFORD") Then
        Dim cb As String: cb = Sheets("BENFORD").Cells(12, 3).Value
        ' "LEVE NÃO-CONFORMIDADE" casa com dois padrões: testar do mais específico
        ' para o mais genérico evita somar as duas penalidades.
        If InStr(cb, "LEVE") > 0 Then
            sc = sc - 3
        ElseIf InStr(cb, "NÃO-CONFORMIDADE") > 0 Then
            sc = sc - 5
        ElseIf InStr(cb, "ACEITÁVEL") > 0 Then
            sc = sc - 1
        End If
    End If

    ' Sobrepreço (–até 15)
    If AbaExiste("SOBREPRECO") Then
        Dim nS As Long: nS = Sheets("SOBREPRECO").Cells(Sheets("SOBREPRECO").Rows.Count, 1).End(xlUp).Row - 1
        sc = sc - WorksheetFunction.Min(15, nS * 1.5)
    End If

    ' Fornecedores (–até 10)
    If AbaExiste("FORNECEDORES") Then
        Dim wsF As Worksheet: Set wsF = Sheets("FORNECEDORES")
        Dim rF As Long
        For rF = 2 To wsF.Cells(wsF.Rows.Count, 1).End(xlUp).Row
            If InStr(wsF.Cells(rF, 5).Value, "CRÍTICO") > 0 Then sc = sc - 10
            If InStr(wsF.Cells(rF, 5).Value, "ATENÇÃO") > 0 Then sc = sc - 5
        Next rF
    End If

    ' --- Extensão BRR: penaliza os 12 testes adicionais (CRÍTICO -2 / ATENÇÃO -0,5; teto por teste) ---
    Dim abEx As Variant, tetoEx As Variant, e As Integer, nc As Long, na As Long, pen As Double
    abEx = Array("OPEX EM ODI", "CAPEX ODM ODD", "DESPESAS VEDADAS", "OBRIG ESPECIAIS", _
                 "AIC UNITIZACAO", "JOA", "CUSTOS ADICIONAIS", "ATIVOS ADMIN", _
                 "DUPLIC ENTRE OBRAS", "INTEGRIDADE CAD", "OBRA SEM LASTRO", "TERRENOS SERVID")
    tetoEx = Array(10, 8, 12, 12, 8, 8, 8, 10, 12, 6, 8, 4)
    For e = 0 To UBound(abEx)
        AudContaSev CStr(abEx(e)), nc, na
        pen = nc * 2 + na * 0.5
        sc = sc - WorksheetFunction.Min(CDbl(tetoEx(e)), pen)
    Next e

    ' --- Forense de dados: indícios (peso menor — não geram glosa direta) ---
    Dim abFo As Variant, tetoFo As Variant, g As Integer
    abFo = Array("VALORES REDONDOS", "FDS FERIADOS", "CUTOFF EXERCICIO", _
                 "FRACIONAMENTO", "USUARIOS", "ESTORNO RELANC")
    tetoFo = Array(4, 4, 5, 6, 4, 6)
    For g = 0 To UBound(abFo)
        AudContaSev CStr(abFo(g)), nc, na
        pen = nc * 1 + na * 0.25
        sc = sc - WorksheetFunction.Min(CDbl(tetoFo(g)), pen)
    Next g

    ' Benford 2º dígito (–até 4): severidade vive numa célula única, não por linha
    If AbaExiste("BENFORD D2") Then
        Dim cb2 As String: cb2 = CStr(Sheets("BENFORD D2").Cells(13, 3).Value)
        If InStr(cb2, "LEVE") > 0 Then
            sc = sc - 2
        ElseIf InStr(cb2, "NÃO-CONFORMIDADE") > 0 Then
            sc = sc - 4
        ElseIf InStr(cb2, "ACEITÁVEL") > 0 Then
            sc = sc - 1
        End If
    End If

    CalcularScore = WorksheetFunction.Max(0, WorksheetFunction.Min(100, sc))
End Function

' ============================================================
' DASHBOARD
' ============================================================
Sub GerarDashboard()

    Dim ws As Worksheet: Set ws = Sheets("DASHBOARD")
    Dim sc As Double: sc = CalcularScore()
    Dim catSc As String, corSc As Long
    If sc >= 85 Then: catSc = "BAIXO RISCO": corSc = RGB(0, 176, 80)
    ElseIf sc >= 65 Then: catSc = "ATENÇÃO":      corSc = RGB(255, 192, 0)
    ElseIf sc >= 45 Then: catSc = "RISCO ELEVADO": corSc = RGB(255, 102, 0)
    Else:                 catSc = "CRÍTICO":       corSc = RGB(255, 0, 0)
    End If

    ' Cabeçalho
    ws.Range("A1:F1").Merge
    ws.Cells(1, 1).Value = "AUDITOR ANEEL — DASHBOARD DE COMPLIANCE | " & Format(Now, "dd/mm/yyyy hh:mm")
    With ws.Cells(1, 1): .Font.Size = 14: .Font.Bold = True: .Interior.Color = RGB(31, 78, 121): .Font.Color = RGB(255, 255, 255): .HorizontalAlignment = xlCenter: End With
    ws.Rows(1).RowHeight = 24

    ' Score
    ws.Range("A2:F4").Merge
    ws.Cells(2, 1).Value = "SCORE DE COMPLIANCE: " & Format(sc, "0.0") & " / 100   —   " & catSc
    With ws.Cells(2, 1): .Font.Size = 18: .Font.Bold = True: .Interior.Color = corSc: .Font.Color = RGB(255, 255, 255): .HorizontalAlignment = xlCenter: .VerticalAlignment = xlCenter: End With
    ws.Rows("2:4").RowHeight = 20

    ' Faixas
    Dim lin As Long: lin = 6
    ws.Cells(lin, 1).Value = "FAIXAS REGULATÓRIAS:": ws.Cells(lin, 1).Font.Bold = True: lin = lin + 1
    Dim fx As Variant, cx As Variant
    fx = Array("≥ 85 → BAIXO RISCO", "65–84 → ATENÇÃO", "45–64 → RISCO ELEVADO", "< 45 → CRÍTICO")
    cx = Array(RGB(0, 176, 80), RGB(255, 192, 0), RGB(255, 102, 0), RGB(255, 0, 0))
    Dim f As Integer
    For f = 0 To 3
        ws.Cells(lin, 1).Value = fx(f): ws.Cells(lin, 1).Interior.Color = cx(f)
        ws.Cells(lin, 1).Font.Color = RGB(255, 255, 255): ws.Cells(lin, 1).Font.Bold = True
        lin = lin + 1
    Next f

    ' Tabela de análises
    lin = lin + 1
    ws.Cells(lin, 1).Value = "ANÁLISE": ws.Cells(lin, 2).Value = "STATUS"
    ws.Cells(lin, 3).Value = "ACHADOS": ws.Cells(lin, 4).Value = "VALOR EM RISCO": ws.Cells(lin, 5).Value = "ABA"
    CabecalhoFormatar ws, lin, 5, RGB(31, 78, 121): lin = lin + 1

    Dim nms As Variant, abs_ As Variant
    nms  = Array("Classificação CAPEX/OPEX", "Duplicidades (intra-PEP)", "ATV DRT (Custos Adm.)", "Retroativos (CPC 23)", "Estornos", "Concentração Fornecedores", "Lei de Benford (MAD)", "Sobrepreço BPR ±10%", _
                 "OPEX capitalizado em ODI", "CAPEX em ODM/ODD", "Despesas vedadas em obra", "Obrigações Especiais", "AIC / Unitização", "JOA acima do teto", "Custos Adicionais / COM", "Ativos administrativos (BAR)", "Duplicidade entre obras", "Integridade cadastral", "Obra sem lastro físico", "Terrenos / Servidões", _
                 "Valores redondos", "Lançamentos em FDS/feriado", "Cutoff de exercício", "Fracionamento de despesa", "Benford 2º dígito (MAD)", "Concentração por usuário", "Estorno + relançamento")
    abs_ = Array("CLASSIFICACAO", "DUPLICIDADES", "ATV_DRT", "RETROATIVOS", "ESTORNOS", "FORNECEDORES", "BENFORD", "SOBREPRECO", _
                 "OPEX EM ODI", "CAPEX ODM ODD", "DESPESAS VEDADAS", "OBRIG ESPECIAIS", "AIC UNITIZACAO", "JOA", "CUSTOS ADICIONAIS", "ATIVOS ADMIN", "DUPLIC ENTRE OBRAS", "INTEGRIDADE CAD", "OBRA SEM LASTRO", "TERRENOS SERVID", _
                 "VALORES REDONDOS", "FDS FERIADOS", "CUTOFF EXERCICIO", "FRACIONAMENTO", "BENFORD D2", "USUARIOS", "ESTORNO RELANC")

    Dim a As Integer
    For a = 0 To UBound(nms)
        Dim nAch As Long: nAch = 0
        Dim vlR As Double: vlR = 0
        If AbaExiste(CStr(abs_(a))) Then
            Dim wsA As Worksheet: Set wsA = Sheets(CStr(abs_(a)))
            Dim ul As Long: ul = wsA.Cells(wsA.Rows.Count, 1).End(xlUp).Row
            nAch = IIf(ul > 1, ul - 1, 0)
            ' Somar coluna de glosa se existir
            Dim cv As Integer
            For cv = 1 To wsA.Cells(1, wsA.Columns.Count).End(xlToLeft).Column
                If InStr(UCase(wsA.Cells(1, cv).Value), "GLOSA") > 0 Or _
                   InStr(UCase(wsA.Cells(1, cv).Value), "VALOR_DUP") > 0 Or _
                   InStr(UCase(wsA.Cells(1, cv).Value), "VALOR_RISCO") > 0 Then
                    If ul > 1 Then vlR = Application.WorksheetFunction.Sum(wsA.Range(wsA.Cells(2, cv), wsA.Cells(ul, cv)))
                    Exit For
                End If
            Next cv
        End If

        Dim st As String, corSt As Long
        If nAch = 0 Then:    st = "OK":      corSt = RGB(198, 239, 206)
        ElseIf nAch <= 5 Then: st = "ATENÇÃO": corSt = RGB(255, 235, 156)
        Else:                  st = "RISCO":   corSt = RGB(255, 199, 206)
        End If

        ws.Cells(lin, 1).Value = nms(a)
        ws.Cells(lin, 2).Value = st: ws.Cells(lin, 2).Interior.Color = corSt
        ws.Cells(lin, 3).Value = nAch
        ws.Cells(lin, 4).Value = vlR: ws.Cells(lin, 4).NumberFormat = "R$ #,##0.00"
        ws.Cells(lin, 5).Value = abs_(a)
        lin = lin + 1
    Next a

    ' Rodapé regulatório
    lin = lin + 2
    ws.Cells(lin, 1).Value = "PARÂMETROS: WACC 8,10% a.a. | BPR ±10% | ATV DRT ≤25% | Materialidade R$ 50k | PRORET 2.3 | NT 77/2025-STR | ISA 320 | Nigrini 2012"
    ws.Cells(lin, 1).Font.Italic = True: ws.Cells(lin, 1).Font.Size = 9

    ws.Columns("A:E").AutoFit

End Sub

' ============================================================
' RESUMO EXECUTIVO
' ============================================================
Sub GerarResumoExecutivo()

    Dim ws As Worksheet: Set ws = Sheets("RESUMO")
    Dim sc As Double: sc = CalcularScore()
    Dim cat As String
    If sc >= 85 Then cat = "BAIXO RISCO"
    If sc >= 65 And sc < 85 Then cat = "ATENÇÃO"
    If sc >= 45 And sc < 65 Then cat = "RISCO ELEVADO"
    If sc < 45 Then cat = "CRÍTICO"

    ws.Range("A1:D1").Merge
    ws.Cells(1, 1).Value = "RESUMO EXECUTIVO — AUDITORIA REGULATÓRIA BRR"
    With ws.Cells(1, 1): .Font.Size = 14: .Font.Bold = True: .Interior.Color = RGB(31, 78, 121): .Font.Color = RGB(255, 255, 255): .HorizontalAlignment = xlCenter: End With

    ws.Cells(2, 1).Value = "Data:":           ws.Cells(2, 2).Value = Format(Now, "dd/mm/yyyy hh:mm")
    ws.Cells(3, 1).Value = "Lançamentos:":    ws.Cells(3, 2).Value = (ultimaLinha - 1) & " linhas na aba DADOS"
    ws.Cells(4, 1).Value = "Score:":          ws.Cells(4, 2).Value = Format(sc, "0.0") & " / 100 — " & cat
    ws.Cells(4, 2).Font.Bold = True

    Dim lin As Long: lin = 6
    ws.Cells(lin, 1).Value = "RESULTADO POR ANÁLISE": ws.Cells(lin, 1).Font.Bold = True
    ws.Range("A" & lin & ":D" & lin).Interior.Color = RGB(220, 230, 241): lin = lin + 1

    Dim nms As Variant, abs_ As Variant
    nms  = Array("Classificação CAPEX/OPEX", "Duplicidades", "ATV DRT", "Retroativos CPC 23", "Estornos", "Fornecedores", "Benford (MAD)", "Sobrepreço BPR", _
                 "OPEX em ODI", "CAPEX em ODM/ODD", "Despesas vedadas", "Obrigações Especiais", "AIC / Unitização", "JOA", "Custos Adicionais", "Ativos administrativos", "Duplicidade entre obras", "Integridade cadastral", "Obra sem lastro", "Terrenos / Servidões", _
                 "Valores redondos", "FDS / feriados", "Cutoff de exercício", "Fracionamento", "Benford 2º dígito", "Concentração por usuário", "Estorno + relançamento")
    abs_ = Array("CLASSIFICACAO", "DUPLICIDADES", "ATV_DRT", "RETROATIVOS", "ESTORNOS", "FORNECEDORES", "BENFORD", "SOBREPRECO", _
                 "OPEX EM ODI", "CAPEX ODM ODD", "DESPESAS VEDADAS", "OBRIG ESPECIAIS", "AIC UNITIZACAO", "JOA", "CUSTOS ADICIONAIS", "ATIVOS ADMIN", "DUPLIC ENTRE OBRAS", "INTEGRIDADE CAD", "OBRA SEM LASTRO", "TERRENOS SERVID", _
                 "VALORES REDONDOS", "FDS FERIADOS", "CUTOFF EXERCICIO", "FRACIONAMENTO", "BENFORD D2", "USUARIOS", "ESTORNO RELANC")

    Dim a As Integer
    For a = 0 To UBound(nms)
        Dim nAch As Long: nAch = 0
        If AbaExiste(CStr(abs_(a))) Then
            Dim ul As Long: ul = Sheets(CStr(abs_(a))).Cells(Sheets(CStr(abs_(a))).Rows.Count, 1).End(xlUp).Row
            nAch = IIf(ul > 1, ul - 1, 0)
        End If
        Dim st As String, cor As Long
        If nAch = 0 Then: st = "OK": cor = RGB(198, 239, 206)
        ElseIf nAch <= 5 Then: st = "ATENÇÃO": cor = RGB(255, 235, 156)
        Else: st = "RISCO": cor = RGB(255, 199, 206)
        End If
        ws.Cells(lin, 1).Value = nms(a)
        ws.Cells(lin, 2).Value = nAch & " achados"
        ws.Cells(lin, 3).Value = st: ws.Cells(lin, 3).Interior.Color = cor
        ws.Cells(lin, 4).Value = "→ aba " & abs_(a): ws.Cells(lin, 4).Font.Italic = True
        lin = lin + 1
    Next a

    lin = lin + 1
    ws.Cells(lin, 1).Value = "NORMAS APLICADAS:": ws.Cells(lin, 1).Font.Bold = True: lin = lin + 1
    ws.Cells(lin, 1).Value = "PRORET 2.3 (BRR) · REN 396/2010 (Inelegibilidades) · REN 674/2015 (MCPSE)"
    lin = lin + 1
    ws.Cells(lin, 1).Value = "CPC 23 (Retroativos) · ISA 320 (Materialidade R$ 50k) · NT 77/2025-STR (WACC 8,10%) · Nigrini 2012 (Benford MAD)"

    ws.Columns("A:D").AutoFit

End Sub

' ============================================================
' UTILITÁRIOS
' ============================================================
Function AbaExiste(nome As String) As Boolean
    Dim ws As Worksheet
    On Error Resume Next: Set ws = Sheets(nome): On Error GoTo 0
    AbaExiste = Not (ws Is Nothing)
End Function

Function Tem(texto As String, palavras As Variant) As Boolean
    Dim p As Variant
    For Each p In palavras
        If InStr(1, texto, CStr(p), vbTextCompare) > 0 Then Tem = True: Exit Function
    Next p
    Tem = False
End Function

Sub CabecalhoFormatar(ws As Worksheet, lin As Long, nCols As Integer, cor As Long)
    With ws.Range(ws.Cells(lin, 1), ws.Cells(lin, nCols))
        .Interior.Color = cor
        .Font.Color = RGB(255, 255, 255)
        .Font.Bold = True
        .HorizontalAlignment = xlCenter
    End With
End Sub


'##############################################################################
'#                                                                            #
'#   MÓDULO 3 — AUDITOR ANEEL: EXTENSÃO BRR (12 TESTES ADICIONAIS)            #
'#                                                                            #
'#   Baseado no que a ANEEL/SFF audita em obras de distribuidoras:            #
'#   PRORET Submódulo 2.3 (BRR/VNR/BPR), MCPSE (REN 674/2015), MCSE           #
'#   (REN 396/2010 v.2022), REN 1000/2021 (Obrigações Especiais),            #
'#   REN 1.058/2023 (BPR), CPC 20 (JOA).                                      #
'#                                                                            #
'#   Testes:                                                                  #
'#    9)  OPEX EM ODI          — OPEX/despesa capitalizado em ordem .I        #
'#   10)  CAPEX ODM ODD        — investimento lançado em ordem .M / .D        #
'#   11)  DESPESAS VEDADAS     — multas, doações, brindes, marketing em obra  #
'#   12)  OBRIG ESPECIAIS      — obra de terceiro (PF/convênio/LpT/doação)    #
'#                               sem crédito de Obrigação Especial            #
'#   13)  AIC UNITIZACAO       — aging/paralisação de ODI (fora da BRR)       #
'#   14)  JOA                  — juros sobre obras acima do teto regulatório  #
'#   15)  CUSTOS ADICIONAIS    — COM/CA/MOP/frete/viagem/adm acima do BPR     #
'#   16)  ATIVOS ADMIN         — veículos/TI/software/móveis (BAR) em obra    #
'#   17)  DUPLIC ENTRE OBRAS   — mesmo doc/material/valor em PEPs distintos    #
'#   18)  INTEGRIDADE CAD      — qtd zerada, UML vazio, qtd líquida negativa  #
'#   19)  OBRA SEM LASTRO      — ODI só serviço, sem material físico          #
'#   20)  TERRENOS SERVID      — terreno/servidão a segregar (sem depreciar)  #
'#                                                                            #
'##############################################################################

' --- Constantes regulatórias da extensão -------------------------------------
Const AUD_MAT_MIN       As Double = 1000    ' materialidade mínima p/ ruído (R$)
Const AUD_OPEX_ATENCAO  As Double = 0.02    ' 2% OPEX em ODI — benchmark CEEE-D
Const AUD_JOA_TETO      As Double = 0.08    ' JOA <= 8% do custo direto
Const AUD_CA_TETO       As Double = 0.35    ' Custos Adicionais <= 35%
Const AUD_COM_TETO      As Double = 0.40    ' COM <= 40% do equipamento principal
Const AUD_ADIC_CRIT     As Double = 0.5     ' adicionais > 50% = crítico
Const AUD_AIC_ATEN_M    As Long = 6         ' ODI parada > 6 meses = atenção
Const AUD_AIC_CRIT_M    As Long = 12        ' ODI parada > 12 meses = crítico
Const AUD_AIC_IDADE_M   As Long = 24        ' AIC com idade > 24 meses = crítico
Const AUD_LASTRO_MIN    As Double = 50000   ' obra sem lastro: só PEPs relevantes
Const AUD_OE_RATIO_MIN  As Double = 0.1     ' aporte < 10% do custo = subaporte

Private gDataBaseAud As Double               ' data-base (max lançamento); 0 = não calc.

' --- Helpers da extensão -----------------------------------------------------
Private Function AudTxt(ws As Worksheet, i As Long, col As Integer) As String
    If col > 0 Then AudTxt = Trim$(CStr(ws.Cells(i, col).Value)) Else AudTxt = ""
End Function

Private Function AudNum(ws As Worksheet, i As Long, col As Integer) As Double
    If col > 0 Then
        If IsNumeric(ws.Cells(i, col).Value) Then AudNum = CDbl(ws.Cells(i, col).Value)
    End If
End Function

Private Function AudNorm(ByVal s As String) As String
    AudNorm = UCase$(SemAcento(Trim$(s)))
End Function

Private Function AudCor(ByVal sev As String) As Long
    Select Case sev
        Case "CRITICO": AudCor = RGB(255, 100, 100)
        Case "GRAVE":   AudCor = RGB(255, 165, 0)
        Case "ATENCAO": AudCor = RGB(255, 235, 156)
        Case "OK":      AudCor = RGB(198, 239, 206)
        Case Else:      AudCor = RGB(242, 242, 242)
    End Select
End Function

Private Function AudDataBase() As Date
    If gDataBaseAud > 0 Then AudDataBase = CDate(gDataBaseAud): Exit Function
    Dim ws As Worksheet: Set ws = Sheets("DADOS")
    Dim i As Long, mx As Double, dd As Double: mx = 0
    If colDATALANC > 0 Then
        For i = 2 To ultimaLinha
            If IsDate(ws.Cells(i, colDATALANC).Value) Then
                dd = CDbl(CDate(ws.Cells(i, colDATALANC).Value))
                If dd > mx Then mx = dd
            End If
        Next i
    End If
    If mx = 0 Then mx = CDbl(Date)
    gDataBaseAud = mx
    AudDataBase = CDate(mx)
End Function

' Conta linhas com severidade CRITICO / ATENCAO numa aba (p/ score)
Private Sub AudContaSev(aba As String, ByRef nCrit As Long, ByRef nAten As Long)
    nCrit = 0: nAten = 0
    If Not AbaExiste(aba) Then Exit Sub
    Dim ws As Worksheet: Set ws = Sheets(aba)
    Dim ul As Long, lc As Long, r As Long, c As Long, t As String, achou As String
    ul = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row
    lc = ws.Cells(1, ws.Columns.Count).End(xlToLeft).Column
    For r = 2 To ul
        achou = ""
        For c = 1 To lc
            t = UCase$(CStr(ws.Cells(r, c).Value))
            If InStr(t, "CRITICO") > 0 Then achou = "C": Exit For
            If InStr(t, "ATENCAO") > 0 Then achou = "A"
        Next c
        If achou = "C" Then
            nCrit = nCrit + 1
        ElseIf achou = "A" Then
            nAten = nAten + 1
        End If
    Next r
End Sub

' =============================================================================
' TESTE 9 — OPEX / DESPESA OPERACIONAL CAPITALIZADO EM ODI (.I)
'   Saneamento do VOC (PRORET 2.3): OPEX em ODI é expurgado. Glosa = 100%.
' =============================================================================
Sub AnalisarOpexEmODI()
    Dim ws As Worksheet, wo As Worksheet
    Set ws = Sheets("DADOS"): Set wo = Sheets("OPEX EM ODI")

    Dim cab As Variant
    cab = Array("PEP_3NIVEL", "DENOMINACAO", "VALOR_TOTAL", "VALOR_OPEX", "PCT_OPEX", "CLASSIFICACAO", "GLOSA_ESTIMADA")
    Dim k As Integer
    For k = 0 To UBound(cab): wo.Cells(1, k + 1).Value = cab(k): Next k
    CabecalhoFormatar wo, 1, UBound(cab) + 1, RGB(155, 0, 0)

    Dim kw As Variant
    kw = Array("MANUT", "PODA", "ROCADA", "LIMPEZA", "INSPE", "LEITURA", "VIAGEM", _
               "DIARIA", "HOSPED", "REFEI", "ALIMENTAC", "TREINAM", "ALUGUEL", _
               "CONSUMO", "O&M", "OPERACAO E MANUT", "CORTE E RELIG", "PRONTO ATEND")

    Dim dTot As Object, dOpx As Object, dDen As Object
    Set dTot = CreateObject("Scripting.Dictionary")
    Set dOpx = CreateObject("Scripting.Dictionary")
    Set dDen = CreateObject("Scripting.Dictionary")

    Dim i As Long, pep As String, p3 As String, vl As Double, ta As String, dsc As String
    For i = 2 To ultimaLinha
        pep = AudTxt(ws, i, colPEP): If pep = "" Then GoTo NX
        If TipoPEP(pep) <> "I" Then GoTo NX          ' só ODI
        vl = AudNum(ws, i, colVALOR): If vl <= 0 Then GoTo NX
        p3 = PEP3(pep)
        If Not dTot.Exists(p3) Then dTot(p3) = 0: dOpx(p3) = 0: dDen(p3) = AudTxt(ws, i, colDENOM)
        dTot(p3) = dTot(p3) + vl
        ta = AudNorm(AudTxt(ws, i, colTIPOAPL))
        dsc = AudNorm(AudTxt(ws, i, colDESC) & " " & AudTxt(ws, i, colTEXTO))
        If ta = "OPEX" Or Tem(dsc, kw) Then dOpx(p3) = dOpx(p3) + vl
NX:
    Next i

    Dim lo As Long: lo = 2
    Dim pk As Variant, vt As Double, vo As Double, pct As Double, sev As String
    For Each pk In dTot.Keys
        vo = dOx_safe(dOpx, CStr(pk)): vt = dTot(pk)
        If vo <= 0 Then GoTo NP
        pct = IIf(vt > 0, vo / vt, 0)
        If vo > 50000 Or pct > AUD_OPEX_ATENCAO Then sev = "CRITICO" Else sev = "ATENCAO"
        wo.Cells(lo, 1).Value = pk
        wo.Cells(lo, 2).Value = dDen(pk)
        wo.Cells(lo, 3).Value = vt:  wo.Cells(lo, 3).NumberFormat = "R$ #,##0.00"
        wo.Cells(lo, 4).Value = vo:  wo.Cells(lo, 4).NumberFormat = "R$ #,##0.00"
        wo.Cells(lo, 5).Value = pct: wo.Cells(lo, 5).NumberFormat = "0.0%"
        wo.Cells(lo, 6).Value = sev
        wo.Cells(lo, 7).Value = vo:  wo.Cells(lo, 7).NumberFormat = "R$ #,##0.00"
        wo.Rows(lo).Interior.Color = AudCor(sev)
        lo = lo + 1
NP:
    Next pk
    If lo = 2 Then wo.Cells(2, 1).Value = "Nenhum OPEX capitalizado em ODI identificado."
    wo.Columns("A:G").AutoFit
End Sub

Private Function dOx_safe(d As Object, key As String) As Double
    If d.Exists(key) Then dOx_safe = d(key) Else dOx_safe = 0
End Function

' =============================================================================
' TESTE 10 — CAPEX / MATERIAL IMOBILIZÁVEL EM ORDEM DE MANUT./DESATIV. (.M/.D)
'   ODM/ODD não constituem UAR. CAPEX aqui = perda de BRR (.M) ou glosa (.D).
' =============================================================================
Sub AnalisarCapexEmODM()
    Dim ws As Worksheet, wo As Worksheet
    Set ws = Sheets("DADOS"): Set wo = Sheets("CAPEX ODM ODD")

    Dim cab As Variant
    cab = Array("PEP_3NIVEL", "TIPO_ORDEM", "DENOMINACAO", "VALOR_TOTAL", "VALOR_ANOMALO", "PCT", "CLASSIFICACAO", "GLOSA_ESTIMADA")
    Dim k As Integer
    For k = 0 To UBound(cab): wo.Cells(1, k + 1).Value = cab(k): Next k
    CabecalhoFormatar wo, 1, UBound(cab) + 1, RGB(112, 48, 160)

    Dim kwMat As Variant
    kwMat = Array("POSTE", "TRANSFORMADOR", "CABO", "CONDUTOR", "CHAVE", "RELIGADOR", _
                  "MEDIDOR", "DISJUNTOR", "REGULADOR", "ESTRUTURA", "CRUZETA", "ISOLADOR")

    Dim dTot As Object, dAno As Object, dDen As Object, dTipo As Object
    Set dTot = CreateObject("Scripting.Dictionary")
    Set dAno = CreateObject("Scripting.Dictionary")
    Set dDen = CreateObject("Scripting.Dictionary")
    Set dTipo = CreateObject("Scripting.Dictionary")

    Dim i As Long, pep As String, p3 As String, vl As Double, tp As String
    Dim ta As String, mat As String, qtd As Double, txt As String, anom As Boolean
    For i = 2 To ultimaLinha
        pep = AudTxt(ws, i, colPEP): If pep = "" Then GoTo NX
        tp = TipoPEP(pep): If tp <> "M" And tp <> "D" Then GoTo NX
        vl = AudNum(ws, i, colVALOR): If vl <= 0 Then GoTo NX
        p3 = PEP3(pep)
        If Not dTot.Exists(p3) Then
            dTot(p3) = 0: dAno(p3) = 0
            dDen(p3) = AudTxt(ws, i, colDENOM)
            dTipo(p3) = IIf(tp = "M", "ODM (.M)", "ODD (.D)")
        End If
        dTot(p3) = dTot(p3) + vl
        ta = AudNorm(AudTxt(ws, i, colTIPOAPL))
        mat = AudTxt(ws, i, colMATERIAL)
        qtd = AudNum(ws, i, colQTD)
        txt = AudNorm(AudTxt(ws, i, colTEXTO))
        anom = (ta = "CAPEX")
        If Not anom And mat <> "" And mat <> "0" And qtd > 0 Then anom = Tem(txt, kwMat)
        If anom Then dAno(p3) = dAno(p3) + vl
NX:
    Next i

    Dim lo As Long: lo = 2
    Dim pk As Variant, vt As Double, va As Double, pct As Double, sev As String
    For Each pk In dTot.Keys
        va = dAno(pk): vt = dTot(pk)
        If va <= 0 Then GoTo NP
        pct = IIf(vt > 0, va / vt, 0)
        If va > 10000 Or pct > 0.2 Then sev = "CRITICO" Else sev = "ATENCAO"
        wo.Cells(lo, 1).Value = pk
        wo.Cells(lo, 2).Value = dTipo(pk)
        wo.Cells(lo, 3).Value = dDen(pk)
        wo.Cells(lo, 4).Value = vt: wo.Cells(lo, 4).NumberFormat = "R$ #,##0.00"
        wo.Cells(lo, 5).Value = va: wo.Cells(lo, 5).NumberFormat = "R$ #,##0.00"
        wo.Cells(lo, 6).Value = pct: wo.Cells(lo, 6).NumberFormat = "0.0%"
        wo.Cells(lo, 7).Value = sev
        wo.Cells(lo, 8).Value = va: wo.Cells(lo, 8).NumberFormat = "R$ #,##0.00"
        wo.Rows(lo).Interior.Color = AudCor(sev)
        lo = lo + 1
NP:
    Next pk
    If lo = 2 Then wo.Cells(2, 1).Value = "Nenhum CAPEX/material imobilizável em ODM/ODD identificado."
    wo.Columns("A:H").AutoFit
End Sub

' =============================================================================
' TESTE 11 — DESPESAS VEDADAS DE CAPITALIZAÇÃO (MCSE — tolerância zero)
'   Multas, doações, brindes, patrocínio, marketing, indenizações em obra.
' =============================================================================
Sub AnalisarDespesasVedadas()
    Dim ws As Worksheet, wo As Worksheet
    Set ws = Sheets("DADOS"): Set wo = Sheets("DESPESAS VEDADAS")

    Dim cab As Variant
    cab = Array("PEP_3NIVEL", "DENOMINACAO", "N_ITENS", "VALOR_VEDADO", "CLASSIFICACAO", "GLOSA_ESTIMADA")
    Dim k As Integer
    For k = 0 To UBound(cab): wo.Cells(1, k + 1).Value = cab(k): Next k
    CabecalhoFormatar wo, 1, UBound(cab) + 1, RGB(192, 0, 0)

    Dim kw As Variant
    kw = Array("MULTA", "MORATOR", "AUTO DE INFRACAO", "PENALIDADE", "DOACAO", "BRINDE", _
               "PATROCIN", "PUBLICIDADE", "PROPAGANDA", "MARKETING", "CONFRATERN", _
               "FESTA", "EVENTO COMEMORAT", "CORTESIA", "COQUETEL")

    Dim dVal As Object, dCnt As Object, dDen As Object
    Set dVal = CreateObject("Scripting.Dictionary")
    Set dCnt = CreateObject("Scripting.Dictionary")
    Set dDen = CreateObject("Scripting.Dictionary")

    Dim i As Long, pep As String, p3 As String, vl As Double, tp As String, txt As String
    For i = 2 To ultimaLinha
        pep = AudTxt(ws, i, colPEP): If pep = "" Then GoTo NX
        tp = TipoPEP(pep): If tp = "S" Then GoTo NX
        vl = AudNum(ws, i, colVALOR): If vl <= 0 Then GoTo NX
        txt = AudNorm(AudTxt(ws, i, colDESC) & " " & AudTxt(ws, i, colTEXTO) & " " & AudTxt(ws, i, colDENOM))
        If Not Tem(txt, kw) Then GoTo NX
        p3 = PEP3(pep)
        If Not dVal.Exists(p3) Then dVal(p3) = 0: dCnt(p3) = 0: dDen(p3) = AudTxt(ws, i, colDENOM)
        dVal(p3) = dVal(p3) + vl: dCnt(p3) = dCnt(p3) + 1
NX:
    Next i

    Dim lo As Long: lo = 2
    Dim pk As Variant
    For Each pk In dVal.Keys
        wo.Cells(lo, 1).Value = pk
        wo.Cells(lo, 2).Value = dDen(pk)
        wo.Cells(lo, 3).Value = dCnt(pk)
        wo.Cells(lo, 4).Value = dVal(pk): wo.Cells(lo, 4).NumberFormat = "R$ #,##0.00"
        wo.Cells(lo, 5).Value = "CRITICO"
        wo.Cells(lo, 6).Value = dVal(pk): wo.Cells(lo, 6).NumberFormat = "R$ #,##0.00"
        wo.Rows(lo).Interior.Color = AudCor("CRITICO")
        lo = lo + 1
    Next pk
    If lo = 2 Then wo.Cells(2, 1).Value = "Nenhuma despesa vedada capitalizada identificada."
    wo.Columns("A:F").AutoFit
End Sub

' =============================================================================
' TESTE 12 — OBRIGAÇÕES ESPECIAIS (REN 1000/2021, PRORET 2.3)
'   Obra custeada por terceiro (participação financeira, convênio público,
'   Luz para Todos, doação) deve ter crédito de OE deduzido da BRR.
'   Sem crédito = remuneração indevida.  IOE = crédito / custo.
' =============================================================================
Sub AnalisarObrigEspeciais()
    Dim ws As Worksheet, wo As Worksheet
    Set ws = Sheets("DADOS"): Set wo = Sheets("OBRIG ESPECIAIS")

    Dim cab As Variant
    cab = Array("PEP_3NIVEL", "ORIGEM_RECURSO", "DENOMINACAO", "CUSTO", "CREDITO_OE", "IOE", "CLASSIFICACAO", "VALOR_RISCO")
    Dim k As Integer
    For k = 0 To UBound(cab): wo.Cells(1, k + 1).Value = cab(k): Next k
    CabecalhoFormatar wo, 1, UBound(cab) + 1, RGB(0, 32, 96)

    Dim mLPT As Variant, mCONV As Variant, mPF As Variant, mDOA As Variant, tokOE As Variant
    mLPT = Array("LUZ PARA TODOS", "LUZ P/ TODOS", "PLPT", "MLPT", "UNIVERSALIZ")
    mCONV = Array("CONVENIO", "PREFEIT", "MUNICIP", "GOVERNO", "GOV EST", "ESTADO DE", "SEINFRA", "EMENDA", "COMODATO")
    mPF = Array("PART FINANC", "PARTICIPACAO FINANCEIRA", "PART.FIN", "P.FINANC", "PARTICIP FIN")
    mDOA = Array("DOACAO", "DOADO", "SUBVENCAO", "SUBVEN", "TERCEIRO", "INCORPORAC", "REDE PARTICULAR")
    tokOE = Array("PARTICIP", "SUBVEN", "DOAC", "CONVENIO", "OBRIG ESP", "APORTE", "CDE", "RGR")

    Dim dCusto As Object, dCred As Object, dOrig As Object, dDen As Object
    Set dCusto = CreateObject("Scripting.Dictionary")
    Set dCred = CreateObject("Scripting.Dictionary")
    Set dOrig = CreateObject("Scripting.Dictionary")
    Set dDen = CreateObject("Scripting.Dictionary")

    Dim i As Long, pep As String, p3 As String, vl As Double
    Dim den As String, dsc As String, org As String
    For i = 2 To ultimaLinha
        pep = AudTxt(ws, i, colPEP): If pep = "" Then GoTo NX
        p3 = PEP3(pep)
        vl = AudNum(ws, i, colVALOR)
        den = AudNorm(AudTxt(ws, i, colDENOM))
        dsc = AudNorm(AudTxt(ws, i, colDESC))
        If Not dCusto.Exists(p3) Then dCusto(p3) = 0: dCred(p3) = 0: dOrig(p3) = "": dDen(p3) = AudTxt(ws, i, colDENOM)
        If vl > 0 Then dCusto(p3) = dCusto(p3) + vl
        If vl < 0 And Tem(dsc, tokOE) Then dCred(p3) = dCred(p3) + Abs(vl)
        ' Rótulo de origem por prioridade LPT > CONVENIO > PART.FINANC > DOACAO
        org = ""
        If Tem(den, mLPT) Or Tem(dsc, mLPT) Then
            org = "LUZ PARA TODOS"
        ElseIf Tem(den, mCONV) Or Tem(dsc, mCONV) Then
            org = "CONVENIO PUBLICO"
        ElseIf Tem(den, mPF) Or Tem(dsc, mPF) Then
            org = "PART. FINANCEIRA"
        ElseIf Tem(den, mDOA) Or Tem(dsc, mDOA) Then
            org = "DOACAO/SUBVENCAO"
        End If
        If org <> "" And dOrig(p3) = "" Then dOrig(p3) = org
NX:
    Next i

    Dim lo As Long: lo = 2
    Dim pk As Variant, custo As Double, cred As Double, ioe As Double, sev As String, risco As Double
    For Each pk In dOrig.Keys
        If dOrig(pk) = "" Then GoTo NP                 ' só PEPs marcados como terceiro
        custo = dCusto(pk): cred = dCred(pk)
        If custo <= 0 Then GoTo NP
        ioe = cred / custo
        risco = custo - cred: If risco < 0 Then risco = 0
        If ioe = 0 Then
            sev = "CRITICO"
        ElseIf ioe >= 0.8 Then
            sev = "OK"
        Else
            sev = "ATENCAO"                             ' crédito parcial — conferir termo/conta OE
        End If
        wo.Cells(lo, 1).Value = pk
        wo.Cells(lo, 2).Value = dOrig(pk)
        wo.Cells(lo, 3).Value = dDen(pk)
        wo.Cells(lo, 4).Value = custo: wo.Cells(lo, 4).NumberFormat = "R$ #,##0.00"
        wo.Cells(lo, 5).Value = cred:  wo.Cells(lo, 5).NumberFormat = "R$ #,##0.00"
        wo.Cells(lo, 6).Value = ioe:   wo.Cells(lo, 6).NumberFormat = "0.0%"
        wo.Cells(lo, 7).Value = sev
        wo.Cells(lo, 8).Value = risco: wo.Cells(lo, 8).NumberFormat = "R$ #,##0.00"
        wo.Rows(lo).Interior.Color = AudCor(sev)
        lo = lo + 1
NP:
    Next pk
    If lo = 2 Then wo.Cells(2, 1).Value = "Nenhuma obra com marcadores de recurso de terceiro identificada."
    wo.Cells(lo + 1, 1).Value = "NOTA: marcadores heurísticos por denominação — conferir termo/convênio e conta 223 (OE) antes de concluir glosa."
    wo.Cells(lo + 1, 1).Font.Italic = True: wo.Cells(lo + 1, 1).Font.Size = 9
    wo.Columns("A:H").AutoFit
End Sub

' =============================================================================
' TESTE 13 — AIC / UNITIZAÇÃO (MCPSE 674/2015; PRORET 2.3)
'   ODI (.I) com saldo parado: obra concluída não unitizada / paralisada.
'   AIC não compõe a BRR até virar AIS.
' =============================================================================
Sub AnalisarAICUnitizacao()
    Dim ws As Worksheet, wo As Worksheet
    Set ws = Sheets("DADOS"): Set wo = Sheets("AIC UNITIZACAO")

    Dim cab As Variant
    cab = Array("PEP_3NIVEL", "DENOMINACAO", "SALDO_AIC", "PRIMEIRO_LANC", "ULTIMO_LANC", "IDADE_MESES", "INATIV_MESES", "CLASSIFICACAO", "VALOR_RISCO")
    Dim k As Integer
    For k = 0 To UBound(cab): wo.Cells(1, k + 1).Value = cab(k): Next k
    CabecalhoFormatar wo, 1, UBound(cab) + 1, RGB(84, 130, 53)

    If colDATALANC = 0 Then
        wo.Cells(2, 1).Value = "Coluna DATA_LANCAMENTO não encontrada — teste de aging indisponível."
        wo.Columns("A:I").AutoFit: Exit Sub
    End If

    Dim db As Double: db = CDbl(AudDataBase())
    Dim dSaldo As Object, dMin As Object, dMax As Object, dDen As Object
    Set dSaldo = CreateObject("Scripting.Dictionary")
    Set dMin = CreateObject("Scripting.Dictionary")
    Set dMax = CreateObject("Scripting.Dictionary")
    Set dDen = CreateObject("Scripting.Dictionary")

    Dim i As Long, pep As String, p3 As String, vl As Double, dd As Double
    For i = 2 To ultimaLinha
        pep = AudTxt(ws, i, colPEP): If pep = "" Then GoTo NX
        If TipoPEP(pep) <> "I" Then GoTo NX
        p3 = PEP3(pep)
        vl = AudNum(ws, i, colVALOR)
        If Not dSaldo.Exists(p3) Then dSaldo(p3) = 0: dDen(p3) = AudTxt(ws, i, colDENOM)
        dSaldo(p3) = dSaldo(p3) + vl
        If IsDate(ws.Cells(i, colDATALANC).Value) Then
            dd = CDbl(CDate(ws.Cells(i, colDATALANC).Value))
            If Not dMin.Exists(p3) Then dMin(p3) = dd Else If dd < dMin(p3) Then dMin(p3) = dd
            If Not dMax.Exists(p3) Then dMax(p3) = dd Else If dd > dMax(p3) Then dMax(p3) = dd
        End If
NX:
    Next i

    Dim lo As Long: lo = 2
    Dim pk As Variant, saldo As Double, idadeM As Long, inatM As Long, sev As String
    For Each pk In dSaldo.Keys
        saldo = dSaldo(pk)
        If saldo < AUD_MAT_MIN Then GoTo NP
        If Not dMin.Exists(pk) Then GoTo NP
        idadeM = DateDiff("m", CDate(dMin(pk)), CDate(db))
        inatM = DateDiff("m", CDate(dMax(pk)), CDate(db))
        If inatM > AUD_AIC_CRIT_M Or idadeM > AUD_AIC_IDADE_M Then
            sev = "CRITICO"
        ElseIf inatM > AUD_AIC_ATEN_M Or idadeM > 12 Then
            sev = "ATENCAO"
        Else
            GoTo NP                                    ' dentro do prazo — não lista
        End If
        wo.Cells(lo, 1).Value = pk
        wo.Cells(lo, 2).Value = dDen(pk)
        wo.Cells(lo, 3).Value = saldo: wo.Cells(lo, 3).NumberFormat = "R$ #,##0.00"
        wo.Cells(lo, 4).Value = CDate(dMin(pk)): wo.Cells(lo, 4).NumberFormat = "dd/mm/yyyy"
        wo.Cells(lo, 5).Value = CDate(dMax(pk)): wo.Cells(lo, 5).NumberFormat = "dd/mm/yyyy"
        wo.Cells(lo, 6).Value = idadeM
        wo.Cells(lo, 7).Value = inatM
        wo.Cells(lo, 8).Value = sev
        wo.Cells(lo, 9).Value = saldo: wo.Cells(lo, 9).NumberFormat = "R$ #,##0.00"
        wo.Rows(lo).Interior.Color = AudCor(sev)
        lo = lo + 1
NP:
    Next pk
    If lo = 2 Then wo.Cells(2, 1).Value = "Nenhuma ODI com saldo parado além do prazo identificada."
    wo.Cells(lo + 1, 1).Value = "Data-base de referência (maior DATA_LANCAMENTO): " & Format(CDate(db), "dd/mm/yyyy")
    wo.Cells(lo + 1, 1).Font.Italic = True: wo.Cells(lo + 1, 1).Font.Size = 9
    wo.Columns("A:I").AutoFit
End Sub

' =============================================================================
' TESTE 14 — JOA (Juros sobre Obras em Andamento) acima do teto regulatório
'   MCSE 6.3.19 / CPC 20: JOA <= WACC × prazo; vedado em obra paralisada.
' =============================================================================
Sub AnalisarJOA()
    Dim ws As Worksheet, wo As Worksheet
    Set ws = Sheets("DADOS"): Set wo = Sheets("JOA")

    Dim cab As Variant
    cab = Array("PEP_3NIVEL", "DENOMINACAO", "CUSTO_DIRETO", "VALOR_JOA", "PCT_JOA", "CLASSIFICACAO", "GLOSA_ESTIMADA")
    Dim k As Integer
    For k = 0 To UBound(cab): wo.Cells(1, k + 1).Value = cab(k): Next k
    CabecalhoFormatar wo, 1, UBound(cab) + 1, RGB(191, 143, 0)

    Dim kw As Variant
    kw = Array("JUROS", "JOA", "ENCARGO FINANC", "VARIACAO MONETARIA", "VARIACAO CAMBIAL", "CAPITALIZACAO DE JUROS")

    Dim dJoa As Object, dDir As Object, dDen As Object
    Set dJoa = CreateObject("Scripting.Dictionary")
    Set dDir = CreateObject("Scripting.Dictionary")
    Set dDen = CreateObject("Scripting.Dictionary")

    Dim i As Long, pep As String, p3 As String, vl As Double, dsc As String
    For i = 2 To ultimaLinha
        pep = AudTxt(ws, i, colPEP): If pep = "" Then GoTo NX
        If TipoPEP(pep) <> "I" Then GoTo NX
        vl = AudNum(ws, i, colVALOR): If vl <= 0 Then GoTo NX
        p3 = PEP3(pep)
        If Not dJoa.Exists(p3) Then dJoa(p3) = 0: dDir(p3) = 0: dDen(p3) = AudTxt(ws, i, colDENOM)
        dsc = AudNorm(AudTxt(ws, i, colDESC) & " " & AudTxt(ws, i, colTEXTO))
        If Tem(dsc, kw) Then dJoa(p3) = dJoa(p3) + vl Else dDir(p3) = dDir(p3) + vl
NX:
    Next i

    Dim lo As Long: lo = 2
    Dim pk As Variant, vj As Double, vd As Double, pct As Double, sev As String, glosa As Double
    For Each pk In dJoa.Keys
        vj = dJoa(pk): If vj <= 0 Then GoTo NP
        vd = dDir(pk)
        pct = IIf(vd > 0, vj / vd, 1)
        If pct > 2 * AUD_JOA_TETO Then
            sev = "CRITICO"
        ElseIf pct > AUD_JOA_TETO Then
            sev = "ATENCAO"
        Else
            sev = "OK"
        End If
        glosa = vj - AUD_JOA_TETO * vd: If glosa < 0 Then glosa = 0
        wo.Cells(lo, 1).Value = pk
        wo.Cells(lo, 2).Value = dDen(pk)
        wo.Cells(lo, 3).Value = vd: wo.Cells(lo, 3).NumberFormat = "R$ #,##0.00"
        wo.Cells(lo, 4).Value = vj: wo.Cells(lo, 4).NumberFormat = "R$ #,##0.00"
        wo.Cells(lo, 5).Value = pct: wo.Cells(lo, 5).NumberFormat = "0.0%"
        wo.Cells(lo, 6).Value = sev
        wo.Cells(lo, 7).Value = glosa: wo.Cells(lo, 7).NumberFormat = "R$ #,##0.00"
        wo.Rows(lo).Interior.Color = AudCor(sev)
        lo = lo + 1
NP:
    Next pk
    If lo = 2 Then wo.Cells(2, 1).Value = "Nenhum JOA/encargo financeiro capitalizado em ODI identificado."
    wo.Cells(lo + 1, 1).Value = "Teto proxy de JOA = " & Format(AUD_JOA_TETO, "0%") & " do custo direto (parametrizável). JOA em obra paralisada é vedado (CPC 20)."
    wo.Cells(lo + 1, 1).Font.Italic = True: wo.Cells(lo + 1, 1).Font.Size = 9
    wo.Columns("A:G").AutoFit
End Sub

' =============================================================================
' TESTE 15 — CUSTOS ADICIONAIS (CA/COM/MOP/FRETE/VIAGEM/ADM) vs BPR
'   PRORET 2.3 / REN 1.058/2023: excedente sobre referenciais é glosado.
' =============================================================================
Sub AnalisarCustosAdicionais()
    Dim ws As Worksheet, wo As Worksheet
    Set ws = Sheets("DADOS"): Set wo = Sheets("CUSTOS ADICIONAIS")

    Dim cab As Variant
    cab = Array("PEP_3NIVEL", "V_TOTAL", "V_PRINCIPAL", "V_COM", "V_CA_SERV", "V_MOP", "V_FRETE", "V_VIAGEM", "V_ADM", "PCT_ADIC", "PCT_COM", "CLASSIFICACAO", "GLOSA_ESTIMADA")
    Dim k As Integer
    For k = 0 To UBound(cab): wo.Cells(1, k + 1).Value = cab(k): Next k
    CabecalhoFormatar wo, 1, UBound(cab) + 1, RGB(197, 90, 17)

    Dim kwPrin As Variant, kwFrete As Variant, kwViag As Variant, kwAdm As Variant, kwMOP As Variant, kwCA As Variant
    kwPrin = Array("POSTE", "TRANSFORMADOR", "CABO", "CONDUTOR", "MEDIDOR", "RELIGADOR", "DISJUNTOR", "REGULADOR", "CHAVE", "ESTRUTURA")
    kwFrete = Array("FRETE", "TRANSPORTE", "CARRETO")
    kwViag = Array("VIAGEM", "ESTADIA", "HOSPED", "ALIMENTAC", "REFEI", "DIARIA")
    kwAdm = Array("RATEIO", "ADMINISTR", "OVERHEAD", "CORPORAT", "APOIO ADMINIST", "GASTOS GERAIS", "INDIRETO")
    kwMOP = Array("MAO DE OBRA", "M.O.", "TURMA", "DRT", "ATV ", "PESSOAL PROPRIO", "FOLHA")
    kwCA = Array("PROJETO", "GERENCIAM", "FISCALIZA", "SUPERVIS", "MONTAGEM", "CANTEIRO", "TOPOGRAF", "SONDAGEM", "LICENCIAM", "ENGENHARIA")

    Dim dP As Object, dC As Object, dCA As Object, dM As Object, dF As Object, dV As Object, dA As Object, dT As Object
    Set dP = CreateObject("Scripting.Dictionary"): Set dC = CreateObject("Scripting.Dictionary")
    Set dCA = CreateObject("Scripting.Dictionary"): Set dM = CreateObject("Scripting.Dictionary")
    Set dF = CreateObject("Scripting.Dictionary"): Set dV = CreateObject("Scripting.Dictionary")
    Set dA = CreateObject("Scripting.Dictionary"): Set dT = CreateObject("Scripting.Dictionary")

    Dim i As Long, pep As String, p3 As String, vl As Double, mat As String, txt As String, buck As String
    For i = 2 To ultimaLinha
        pep = AudTxt(ws, i, colPEP): If pep = "" Then GoTo NX
        If TipoPEP(pep) <> "I" Then GoTo NX
        vl = AudNum(ws, i, colVALOR): If vl <= 0 Then GoTo NX
        p3 = PEP3(pep)
        If Not dT.Exists(p3) Then
            dT(p3) = 0: dP(p3) = 0: dC(p3) = 0: dCA(p3) = 0
            dM(p3) = 0: dF(p3) = 0: dV(p3) = 0: dA(p3) = 0
        End If
        dT(p3) = dT(p3) + vl
        mat = AudTxt(ws, i, colMATERIAL)
        txt = AudNorm(AudTxt(ws, i, colTEXTO) & " " & AudTxt(ws, i, colDESC))
        buck = AudBucketCA(txt, mat, kwPrin, kwFrete, kwViag, kwAdm, kwMOP, kwCA)
        Select Case buck
            Case "P": dP(p3) = dP(p3) + vl
            Case "COM": dC(p3) = dC(p3) + vl
            Case "CA": dCA(p3) = dCA(p3) + vl
            Case "MOP": dM(p3) = dM(p3) + vl
            Case "FRETE": dF(p3) = dF(p3) + vl
            Case "VIAG": dV(p3) = dV(p3) + vl
            Case "ADM": dA(p3) = dA(p3) + vl
        End Select
NX:
    Next i

    Dim lo As Long: lo = 2
    Dim pk As Variant, vt As Double, vp As Double, vc As Double, vca As Double
    Dim vm As Double, vf As Double, vv As Double, va As Double
    Dim vAdic As Double, pctAdic As Double, pctCom As Double, sev As String, glosa As Double
    For Each pk In dT.Keys
        vt = dT(pk): If vt < AUD_MAT_MIN Then GoTo NP
        vp = dP(pk): vc = dC(pk): vca = dCA(pk): vm = dM(pk): vf = dF(pk): vv = dV(pk): va = dA(pk)
        vAdic = vca + vm + vf + vv + va
        pctAdic = IIf(vt > 0, vAdic / vt, 0)
        pctCom = IIf((vp + vc) > 0, vc / (vp + vc), 0)
        If pctAdic > AUD_ADIC_CRIT Or pctCom > 0.6 Or (vp = 0 And (vc + vAdic) > 0) Then
            sev = "CRITICO"
        ElseIf pctAdic > AUD_CA_TETO Or pctCom > AUD_COM_TETO Then
            sev = "ATENCAO"
        Else
            GoTo NP
        End If
        glosa = 0
        If vAdic > AUD_CA_TETO * vt Then glosa = glosa + (vAdic - AUD_CA_TETO * vt)
        If vc > AUD_COM_TETO * vp Then glosa = glosa + (vc - AUD_COM_TETO * vp)
        wo.Cells(lo, 1).Value = pk
        wo.Cells(lo, 2).Value = vt:  wo.Cells(lo, 2).NumberFormat = "R$ #,##0.00"
        wo.Cells(lo, 3).Value = vp:  wo.Cells(lo, 3).NumberFormat = "R$ #,##0.00"
        wo.Cells(lo, 4).Value = vc:  wo.Cells(lo, 4).NumberFormat = "R$ #,##0.00"
        wo.Cells(lo, 5).Value = vca: wo.Cells(lo, 5).NumberFormat = "R$ #,##0.00"
        wo.Cells(lo, 6).Value = vm:  wo.Cells(lo, 6).NumberFormat = "R$ #,##0.00"
        wo.Cells(lo, 7).Value = vf:  wo.Cells(lo, 7).NumberFormat = "R$ #,##0.00"
        wo.Cells(lo, 8).Value = vv:  wo.Cells(lo, 8).NumberFormat = "R$ #,##0.00"
        wo.Cells(lo, 9).Value = va:  wo.Cells(lo, 9).NumberFormat = "R$ #,##0.00"
        wo.Cells(lo, 10).Value = pctAdic: wo.Cells(lo, 10).NumberFormat = "0.0%"
        wo.Cells(lo, 11).Value = pctCom:  wo.Cells(lo, 11).NumberFormat = "0.0%"
        wo.Cells(lo, 12).Value = sev
        wo.Cells(lo, 13).Value = glosa: wo.Cells(lo, 13).NumberFormat = "R$ #,##0.00"
        wo.Rows(lo).Interior.Color = AudCor(sev)
        lo = lo + 1
NP:
    Next pk
    If lo = 2 Then wo.Cells(2, 1).Value = "Nenhuma obra com custos adicionais/COM fora do padrão identificada."
    wo.Cells(lo + 1, 1).Value = "Tetos proxy: Custos Adicionais " & Format(AUD_CA_TETO, "0%") & " do total; COM " & Format(AUD_COM_TETO, "0%") & " do principal. Glosa oficial usa BPR por tipologia."
    wo.Cells(lo + 1, 1).Font.Italic = True: wo.Cells(lo + 1, 1).Font.Size = 9
    wo.Columns("A:M").AutoFit
End Sub

Private Function AudBucketCA(txt As String, mat As String, kwPrin, kwFrete, kwViag, kwAdm, kwMOP, kwCA) As String
    If Tem(txt, kwPrin) Then AudBucketCA = "P": Exit Function
    If Tem(txt, kwFrete) Then AudBucketCA = "FRETE": Exit Function
    If Tem(txt, kwViag) Then AudBucketCA = "VIAG": Exit Function
    If Tem(txt, kwAdm) Then AudBucketCA = "ADM": Exit Function
    If Tem(txt, kwMOP) Then AudBucketCA = "MOP": Exit Function
    If Tem(txt, kwCA) Then AudBucketCA = "CA": Exit Function
    If mat <> "" And mat <> "0" Then AudBucketCA = "COM": Exit Function   ' material acessório
    AudBucketCA = "CA"                                                     ' serviço genérico
End Function

' =============================================================================
' TESTE 16 — ATIVOS ADMINISTRATIVOS / DE ANUIDADE (BAR) EM OBRA DE REDE
'   MCSE 17.3/17.4: veículos, TI, software, móveis não compõem o AIS/BRR.
' =============================================================================
Sub AnalisarAtivosAdmin()
    Dim ws As Worksheet, wo As Worksheet
    Set ws = Sheets("DADOS"): Set wo = Sheets("ATIVOS ADMIN")

    Dim cab As Variant
    cab = Array("PEP_3NIVEL", "TIPO_ORDEM", "DENOMINACAO", "N_ITENS", "VALOR_BAR", "CLASSIFICACAO", "GLOSA_ESTIMADA")
    Dim k As Integer
    For k = 0 To UBound(cab): wo.Cells(1, k + 1).Value = cab(k): Next k
    CabecalhoFormatar wo, 1, UBound(cab) + 1, RGB(112, 48, 160)

    Dim kw As Variant
    kw = Array("VEICULO", "CAMINHONETE", "AUTOMOVEL", "PICK UP", "NOTEBOOK", "DESKTOP", _
               "COMPUTADOR", "MICROCOMPUT", "IMPRESSORA", "SOFTWARE", "LICENCA DE USO", _
               "CELULAR", "SMARTPHONE", "TABLET", "MOBILIARIO", "MOVEIS ", "CADEIRA", _
               "ARMARIO", "ESTACAO DE TRABALHO", "AR CONDICIONADO")

    Dim dVal As Object, dCnt As Object, dDen As Object, dTipo As Object, dCrit As Object
    Set dVal = CreateObject("Scripting.Dictionary")
    Set dCnt = CreateObject("Scripting.Dictionary")
    Set dDen = CreateObject("Scripting.Dictionary")
    Set dTipo = CreateObject("Scripting.Dictionary")
    Set dCrit = CreateObject("Scripting.Dictionary")

    Dim i As Long, pep As String, p3 As String, vl As Double, tp As String, txt As String
    For i = 2 To ultimaLinha
        pep = AudTxt(ws, i, colPEP): If pep = "" Then GoTo NX
        tp = TipoPEP(pep): If tp = "S" Then GoTo NX
        vl = AudNum(ws, i, colVALOR): If vl <= 0 Then GoTo NX
        txt = AudNorm(AudTxt(ws, i, colTEXTO) & " " & AudTxt(ws, i, colDESC))
        If Not Tem(txt, kw) Then GoTo NX
        p3 = PEP3(pep)
        If Not dVal.Exists(p3) Then
            dVal(p3) = 0: dCnt(p3) = 0: dDen(p3) = AudTxt(ws, i, colDENOM)
            dTipo(p3) = "": dCrit(p3) = False
        End If
        dVal(p3) = dVal(p3) + vl: dCnt(p3) = dCnt(p3) + 1
        If InStr(dTipo(p3), tp) = 0 Then dTipo(p3) = Trim(dTipo(p3) & " " & tp)
        If tp = "I" Then dCrit(p3) = True
NX:
    Next i

    Dim lo As Long: lo = 2
    Dim pk As Variant, sev As String
    For Each pk In dVal.Keys
        sev = IIf(dCrit(pk), "CRITICO", "ATENCAO")
        wo.Cells(lo, 1).Value = pk
        wo.Cells(lo, 2).Value = dTipo(pk)
        wo.Cells(lo, 3).Value = dDen(pk)
        wo.Cells(lo, 4).Value = dCnt(pk)
        wo.Cells(lo, 5).Value = dVal(pk): wo.Cells(lo, 5).NumberFormat = "R$ #,##0.00"
        wo.Cells(lo, 6).Value = sev
        wo.Cells(lo, 7).Value = IIf(dCrit(pk), dVal(pk), 0): wo.Cells(lo, 7).NumberFormat = "R$ #,##0.00"
        wo.Rows(lo).Interior.Color = AudCor(sev)
        lo = lo + 1
    Next pk
    If lo = 2 Then wo.Cells(2, 1).Value = "Nenhum ativo administrativo/de anuidade (BAR) em obra identificado."
    wo.Columns("A:G").AutoFit
End Sub

' =============================================================================
' TESTE 17 — DUPLICIDADE ENTRE OBRAS (mesmo doc/material/valor em PEPs distintos)
'   Custo apropriado em mais de uma ODI — expurgo do excedente na BRR.
' =============================================================================
Sub AnalisarDuplicEntreObras()
    Dim ws As Worksheet, wo As Worksheet
    Set ws = Sheets("DADOS"): Set wo = Sheets("DUPLIC ENTRE OBRAS")

    Dim cab As Variant
    cab = Array("NUM_DOC", "MATERIAL", "VALOR_UNIT", "PEPS_ENVOLVIDOS", "N_PEPS", "N_OCORR", "CLASSIFICACAO", "GLOSA_ESTIMADA")
    Dim k As Integer
    For k = 0 To UBound(cab): wo.Cells(1, k + 1).Value = cab(k): Next k
    CabecalhoFormatar wo, 1, UBound(cab) + 1, RGB(155, 0, 0)

    If colNUMDOC = 0 Then
        wo.Cells(2, 1).Value = "Coluna NUM_DOC não encontrada — teste indisponível."
        wo.Columns("A:H").AutoFit: Exit Sub
    End If

    Dim dPeps As Object, dCnt As Object, dVal As Object, dDoc As Object, dMat As Object
    Set dPeps = CreateObject("Scripting.Dictionary")
    Set dCnt = CreateObject("Scripting.Dictionary")
    Set dVal = CreateObject("Scripting.Dictionary")
    Set dDoc = CreateObject("Scripting.Dictionary")
    Set dMat = CreateObject("Scripting.Dictionary")

    Dim i As Long, pep As String, p3 As String, ndoc As String, mat As String, vl As Double, key As String
    For i = 2 To ultimaLinha
        pep = AudTxt(ws, i, colPEP): If pep = "" Then GoTo NX
        vl = AudNum(ws, i, colVALOR): If vl <= 0 Then GoTo NX
        ndoc = AudTxt(ws, i, colNUMDOC): If ndoc = "" Then GoTo NX
        mat = AudTxt(ws, i, colMATERIAL): If mat = "" Or mat = "0" Then GoTo NX
        p3 = PEP3(pep)
        key = ndoc & "|" & mat & "|" & Format(vl, "0.00")
        If Not dCnt.Exists(key) Then
            dCnt(key) = 0: dPeps(key) = "|": dVal(key) = vl
            dDoc(key) = ndoc: dMat(key) = mat
        End If
        dCnt(key) = dCnt(key) + 1
        If InStr(dPeps(key), "|" & p3 & "|") = 0 Then dPeps(key) = dPeps(key) & p3 & "|"
NX:
    Next i

    Dim lo As Long: lo = 2
    Dim kk As Variant, peps As String, nPep As Long, arr() As String
    For Each kk In dCnt.Keys
        peps = dPeps(kk)
        arr = Split(Mid(peps, 2, Len(peps) - 2), "|")   ' remove | das pontas
        nPep = 0
        If Len(Trim(peps)) > 2 Then nPep = UBound(arr) + 1
        If nPep < 2 Then GoTo NP                          ' precisa >= 2 PEPs distintos
        wo.Cells(lo, 1).Value = dDoc(kk)
        wo.Cells(lo, 2).Value = dMat(kk)
        wo.Cells(lo, 3).Value = dVal(kk): wo.Cells(lo, 3).NumberFormat = "R$ #,##0.00"
        wo.Cells(lo, 4).Value = Replace(Mid(peps, 2, Len(peps) - 2), "|", "  |  ")
        wo.Cells(lo, 5).Value = nPep
        wo.Cells(lo, 6).Value = dCnt(kk)
        wo.Cells(lo, 7).Value = "CRITICO"
        wo.Cells(lo, 8).Value = dVal(kk) * (nPep - 1): wo.Cells(lo, 8).NumberFormat = "R$ #,##0.00"
        wo.Rows(lo).Interior.Color = AudCor("CRITICO")
        lo = lo + 1
NP:
    Next kk
    If lo = 2 Then wo.Cells(2, 1).Value = "Nenhum documento/material apropriado em PEPs distintos identificado."
    wo.Columns("A:H").AutoFit
End Sub

' =============================================================================
' TESTE 18 — INTEGRIDADE CADASTRAL (impede unitização por UC/UAR)
'   Qtd zerada com valor, UML vazio, quantidade líquida negativa por material.
' =============================================================================
Sub AnalisarIntegridadeCad()
    Dim ws As Worksheet, wo As Worksheet
    Set ws = Sheets("DADOS"): Set wo = Sheets("INTEGRIDADE CAD")

    Dim cab As Variant
    cab = Array("PEP_3NIVEL", "DENOMINACAO", "VAL_QTD_ZERO", "VAL_UML_VAZIO", "VAL_QTD_NEG_LIQ", "N_OCORR", "CLASSIFICACAO", "VALOR_RISCO")
    Dim k As Integer
    For k = 0 To UBound(cab): wo.Cells(1, k + 1).Value = cab(k): Next k
    CabecalhoFormatar wo, 1, UBound(cab) + 1, RGB(0, 112, 192)

    If colQTD = 0 Then
        wo.Cells(2, 1).Value = "Coluna QTD_ENTRADA não encontrada — teste indisponível."
        wo.Columns("A:H").AutoFit: Exit Sub
    End If

    Dim dQZero As Object, dUml As Object, dOcc As Object, dDen As Object
    Dim dQtdMat As Object, dValMat As Object
    Set dQZero = CreateObject("Scripting.Dictionary")
    Set dUml = CreateObject("Scripting.Dictionary")
    Set dOcc = CreateObject("Scripting.Dictionary")
    Set dDen = CreateObject("Scripting.Dictionary")
    Set dQtdMat = CreateObject("Scripting.Dictionary")
    Set dValMat = CreateObject("Scripting.Dictionary")

    Dim i As Long, pep As String, p3 As String, vl As Double, qtd As Double
    Dim mat As String, uml As String, km As String
    For i = 2 To ultimaLinha
        pep = AudTxt(ws, i, colPEP): If pep = "" Then GoTo NX
        p3 = PEP3(pep)
        vl = AudNum(ws, i, colVALOR)
        qtd = AudNum(ws, i, colQTD)
        mat = AudTxt(ws, i, colMATERIAL)
        uml = AudTxt(ws, i, colUML)
        If Not dOcc.Exists(p3) Then
            dQZero(p3) = 0: dUml(p3) = 0: dOcc(p3) = 0: dDen(p3) = AudTxt(ws, i, colDENOM)
        End If
        If mat <> "" And mat <> "0" And vl > 0 And qtd = 0 Then
            dQZero(p3) = dQZero(p3) + vl: dOcc(p3) = dOcc(p3) + 1
        End If
        If mat <> "" And mat <> "0" And qtd <> 0 And uml = "" And colUML > 0 Then
            dUml(p3) = dUml(p3) + Abs(vl): dOcc(p3) = dOcc(p3) + 1
        End If
        If mat <> "" And mat <> "0" Then
            km = p3 & "|" & mat
            If Not dQtdMat.Exists(km) Then dQtdMat(km) = 0: dValMat(km) = 0
            dQtdMat(km) = dQtdMat(km) + qtd
            dValMat(km) = dValMat(km) + vl
        End If
NX:
    Next i

    ' Consolidar quantidade líquida negativa por PEP
    Dim dNegLiq As Object: Set dNegLiq = CreateObject("Scripting.Dictionary")
    Dim km2 As Variant, parts() As String, pp As String
    For Each km2 In dQtdMat.Keys
        If dQtdMat(km2) < 0 And dValMat(km2) > 0 Then
            parts = Split(CStr(km2), "|")
            pp = parts(0)
            If Not dNegLiq.Exists(pp) Then dNegLiq(pp) = 0
            dNegLiq(pp) = dNegLiq(pp) + dValMat(km2)
        End If
    Next km2

    Dim lo As Long: lo = 2
    Dim pk As Variant, vz As Double, vu As Double, vn As Double, risco As Double, sev As String
    For Each pk In dOcc.Keys
        vz = dQZero(pk): vu = dUml(pk)
        vn = 0: If dNegLiq.Exists(pk) Then vn = dNegLiq(pk)
        risco = vz + vu + vn
        If risco < AUD_MAT_MIN Then GoTo NP
        If vn > 0 Or vz > 20000 Then sev = "CRITICO" Else sev = "ATENCAO"
        wo.Cells(lo, 1).Value = pk
        wo.Cells(lo, 2).Value = dDen(pk)
        wo.Cells(lo, 3).Value = vz: wo.Cells(lo, 3).NumberFormat = "R$ #,##0.00"
        wo.Cells(lo, 4).Value = vu: wo.Cells(lo, 4).NumberFormat = "R$ #,##0.00"
        wo.Cells(lo, 5).Value = vn: wo.Cells(lo, 5).NumberFormat = "R$ #,##0.00"
        wo.Cells(lo, 6).Value = dOcc(pk)
        wo.Cells(lo, 7).Value = sev
        wo.Cells(lo, 8).Value = risco: wo.Cells(lo, 8).NumberFormat = "R$ #,##0.00"
        wo.Rows(lo).Interior.Color = AudCor(sev)
        lo = lo + 1
NP:
    Next pk
    If lo = 2 Then wo.Cells(2, 1).Value = "Nenhuma inconsistência cadastral relevante identificada."
    wo.Columns("A:H").AutoFit
End Sub

' =============================================================================
' TESTE 19 — OBRA SEM LASTRO FÍSICO (ODI relevante só com serviço, sem material)
'   Sem ativo físico rastreável não há como unitizar/localizar em campo.
' =============================================================================
Sub AnalisarObraSemLastro()
    Dim ws As Worksheet, wo As Worksheet
    Set ws = Sheets("DADOS"): Set wo = Sheets("OBRA SEM LASTRO")

    Dim cab As Variant
    cab = Array("PEP_3NIVEL", "DENOMINACAO", "V_TOTAL", "V_MATERIAL_FISICO", "PCT_FISICO", "CLASSIFICACAO", "VALOR_RISCO")
    Dim k As Integer
    For k = 0 To UBound(cab): wo.Cells(1, k + 1).Value = cab(k): Next k
    CabecalhoFormatar wo, 1, UBound(cab) + 1, RGB(192, 0, 0)

    Dim dTot As Object, dFis As Object, dDen As Object
    Set dTot = CreateObject("Scripting.Dictionary")
    Set dFis = CreateObject("Scripting.Dictionary")
    Set dDen = CreateObject("Scripting.Dictionary")

    Dim i As Long, pep As String, p3 As String, vl As Double, mat As String, qtd As Double
    For i = 2 To ultimaLinha
        pep = AudTxt(ws, i, colPEP): If pep = "" Then GoTo NX
        If TipoPEP(pep) <> "I" Then GoTo NX
        vl = AudNum(ws, i, colVALOR): If vl <= 0 Then GoTo NX
        p3 = PEP3(pep)
        If Not dTot.Exists(p3) Then dTot(p3) = 0: dFis(p3) = 0: dDen(p3) = AudTxt(ws, i, colDENOM)
        dTot(p3) = dTot(p3) + vl
        mat = AudTxt(ws, i, colMATERIAL): qtd = AudNum(ws, i, colQTD)
        If mat <> "" And mat <> "0" And qtd > 0 Then dFis(p3) = dFis(p3) + vl
NX:
    Next i

    Dim lo As Long: lo = 2
    Dim pk As Variant, vt As Double, vf As Double, pct As Double, sev As String
    For Each pk In dTot.Keys
        vt = dTot(pk): If vt < AUD_LASTRO_MIN Then GoTo NP
        vf = dFis(pk)
        pct = IIf(vt > 0, vf / vt, 0)
        If pct = 0 Then
            sev = "CRITICO"
        ElseIf pct < 0.2 Then
            sev = "ATENCAO"
        Else
            GoTo NP
        End If
        wo.Cells(lo, 1).Value = pk
        wo.Cells(lo, 2).Value = dDen(pk)
        wo.Cells(lo, 3).Value = vt: wo.Cells(lo, 3).NumberFormat = "R$ #,##0.00"
        wo.Cells(lo, 4).Value = vf: wo.Cells(lo, 4).NumberFormat = "R$ #,##0.00"
        wo.Cells(lo, 5).Value = pct: wo.Cells(lo, 5).NumberFormat = "0.0%"
        wo.Cells(lo, 6).Value = sev
        wo.Cells(lo, 7).Value = vt - vf: wo.Cells(lo, 7).NumberFormat = "R$ #,##0.00"
        wo.Rows(lo).Interior.Color = AudCor(sev)
        lo = lo + 1
NP:
    Next pk
    If lo = 2 Then wo.Cells(2, 1).Value = "Nenhuma ODI relevante sem lastro físico identificada."
    wo.Columns("A:G").AutoFit
End Sub

' =============================================================================
' TESTE 20 — TERRENOS E SERVIDÕES (segregar; sem depreciação)
'   PRORET 2.3 / MCPSE Tab. XVI: avaliação a mercado, sem quota de reintegração.
' =============================================================================
Sub AnalisarTerrenosServidoes()
    Dim ws As Worksheet, wo As Worksheet
    Set ws = Sheets("DADOS"): Set wo = Sheets("TERRENOS SERVID")

    Dim cab As Variant
    cab = Array("PEP_3NIVEL", "DENOMINACAO", "V_TOTAL", "V_TERRENO_SERVID", "PCT", "CLASSIFICACAO", "VALOR_SEGREGAR")
    Dim k As Integer
    For k = 0 To UBound(cab): wo.Cells(1, k + 1).Value = cab(k): Next k
    CabecalhoFormatar wo, 1, UBound(cab) + 1, RGB(84, 130, 53)

    Dim kw As Variant
    kw = Array("TERRENO", "SERVIDAO", "DESAPROPRIA", "FAIXA DE PASSAGEM", "FAIXA DE SERVIDAO", "INDENIZACAO DE PASSAGEM", "AQUISICAO DE AREA")

    Dim dTot As Object, dTer As Object, dDen As Object
    Set dTot = CreateObject("Scripting.Dictionary")
    Set dTer = CreateObject("Scripting.Dictionary")
    Set dDen = CreateObject("Scripting.Dictionary")

    Dim i As Long, pep As String, p3 As String, vl As Double, txt As String
    For i = 2 To ultimaLinha
        pep = AudTxt(ws, i, colPEP): If pep = "" Then GoTo NX
        If TipoPEP(pep) <> "I" Then GoTo NX
        vl = AudNum(ws, i, colVALOR): If vl <= 0 Then GoTo NX
        p3 = PEP3(pep)
        If Not dTot.Exists(p3) Then dTot(p3) = 0: dTer(p3) = 0: dDen(p3) = AudTxt(ws, i, colDENOM)
        dTot(p3) = dTot(p3) + vl
        txt = AudNorm(AudTxt(ws, i, colTEXTO) & " " & AudTxt(ws, i, colDESC) & " " & AudTxt(ws, i, colDENOM))
        If Tem(txt, kw) Then dTer(p3) = dTer(p3) + vl
NX:
    Next i

    Dim lo As Long: lo = 2
    Dim pk As Variant, vt As Double, vter As Double, pct As Double, sev As String
    For Each pk In dTer.Keys
        vter = dTer(pk): If vter <= 0 Then GoTo NP
        vt = dTot(pk)
        pct = IIf(vt > 0, vter / vt, 0)
        If pct > 0.2 Then sev = "CRITICO" Else sev = "ATENCAO"
        wo.Cells(lo, 1).Value = pk
        wo.Cells(lo, 2).Value = dDen(pk)
        wo.Cells(lo, 3).Value = vt: wo.Cells(lo, 3).NumberFormat = "R$ #,##0.00"
        wo.Cells(lo, 4).Value = vter: wo.Cells(lo, 4).NumberFormat = "R$ #,##0.00"
        wo.Cells(lo, 5).Value = pct: wo.Cells(lo, 5).NumberFormat = "0.0%"
        wo.Cells(lo, 6).Value = sev
        wo.Cells(lo, 7).Value = vter: wo.Cells(lo, 7).NumberFormat = "R$ #,##0.00"
        wo.Rows(lo).Interior.Color = AudCor(sev)
        lo = lo + 1
NP:
    Next pk
    If lo = 2 Then wo.Cells(2, 1).Value = "Nenhum terreno/servidão em ODI identificado."
    wo.Cells(lo + 1, 1).Value = "NOTA: valor a SEGREGAR (não é glosa) — terreno/servidão entra na BRR a valor de mercado, sem depreciação (Tab. XVI MCPSE)."
    wo.Cells(lo + 1, 1).Font.Italic = True: wo.Cells(lo + 1, 1).Font.Size = 9
    wo.Columns("A:G").AutoFit
End Sub


'##############################################################################
'#                                                                            #
'#   MÓDULO 4 — AUDITOR ANEEL: FORENSE DE DADOS (7 TESTES ADICIONAIS)         #
'#                                                                            #
'#   Técnicas de auditoria forense sobre lançamentos contábeis de obras       #
'#   (padrões TCU/CGU/Big4, Nigrini 2012, ISA 240):                           #
'#                                                                            #
'#   21)  VALORES REDONDOS    — excesso de lançamentos em valores redondos    #
'#   22)  FDS FERIADOS        — lançamentos em fim de semana e feriados       #
'#   23)  CUTOFF EXERCICIO    — concentração de custos no fim do exercício    #
'#   24)  FRACIONAMENTO       — múltiplos docs pequenos no mesmo dia/PEP      #
'#   25)  BENFORD D2          — Lei de Benford no 2º dígito (MAD)             #
'#   26)  USUARIOS            — concentração de lançamentos por usuário       #
'#   27)  ESTORNO RELANC      — estorno seguido de relançamento alterado      #
'#                                                                            #
'##############################################################################

' --- Constantes forenses ------------------------------------------------------
Const FOR_REDONDO_ATEN  As Double = 0.05   ' > 5% dos lançamentos redondos = atenção
Const FOR_REDONDO_CRIT  As Double = 0.15   ' > 15% = crítico
Const FOR_DEZ_ATEN      As Double = 0.15   ' dezembro > 15% do ano = atenção
Const FOR_DEZ_CRIT      As Double = 0.3    ' dezembro > 30% do ano = crítico
Const FOR_FRAC_NDOC     As Long = 3        ' >= 3 docs no mesmo dia/PEP/usuário
Const FOR_FRAC_NDOC_CR  As Long = 5        ' >= 5 docs = crítico
Const FOR_USR_ATEN      As Double = 0.4    ' top usuário > 40% do valor = atenção
Const FOR_USR_CRIT      As Double = 0.6    ' top usuário > 60% = crítico
Const FOR_RELANC_DIAS   As Long = 30       ' janela estorno -> relançamento
Const FOR_RELANC_DELTA  As Double = 0.2    ' delta de valor de 0% a 20%
Const FOR_BENF2_CONF    As Double = 0.8    ' MAD 2º dígito (pp) — Nigrini
Const FOR_BENF2_ACEIT   As Double = 1#
Const FOR_BENF2_LEVE    As Double = 1.2

Private Function EhFeriadoFixo(dt As Date) As Boolean
    Select Case Format(dt, "dd/mm")
        Case "01/01", "21/04", "01/05", "07/09", "12/10", "02/11", "15/11", "25/12"
            EhFeriadoFixo = True
        Case Else
            EhFeriadoFixo = False
    End Select
End Function

' =============================================================================
' TESTE 21 — VALORES REDONDOS (round numbers, ISA 240)
'   Custo real de obra raramente cai em múltiplos exatos de R$ 1.000.
' =============================================================================
Sub AnalisarValoresRedondos()
    Dim ws As Worksheet, wo As Worksheet
    Set ws = Sheets("DADOS"): Set wo = Sheets("VALORES REDONDOS")

    Dim cab As Variant
    cab = Array("PEP_3NIVEL", "DENOMINACAO", "N_LANC", "N_REDONDOS", "PCT_REDONDOS", "VALOR_REDONDO", "CLASSIFICACAO")
    Dim k As Integer
    For k = 0 To UBound(cab): wo.Cells(1, k + 1).Value = cab(k): Next k
    CabecalhoFormatar wo, 1, UBound(cab) + 1, RGB(68, 114, 196)

    Dim dN As Object, dR As Object, dV As Object, dDen As Object
    Set dN = CreateObject("Scripting.Dictionary")
    Set dR = CreateObject("Scripting.Dictionary")
    Set dV = CreateObject("Scripting.Dictionary")
    Set dDen = CreateObject("Scripting.Dictionary")

    Dim i As Long, pep As String, p3 As String, vl As Double
    Dim nTot As Long, nRed As Long
    For i = 2 To ultimaLinha
        pep = AudTxt(ws, i, colPEP): If pep = "" Then GoTo NX
        vl = AudNum(ws, i, colVALOR): If vl < 1000 Then GoTo NX
        p3 = PEP3(pep)
        If Not dN.Exists(p3) Then dN(p3) = 0: dR(p3) = 0: dV(p3) = 0: dDen(p3) = AudTxt(ws, i, colDENOM)
        dN(p3) = dN(p3) + 1: nTot = nTot + 1
        If vl = Fix(vl / 1000) * 1000 Then
            dR(p3) = dR(p3) + 1: dV(p3) = dV(p3) + vl: nRed = nRed + 1
        End If
NX:
    Next i

    Dim lo As Long: lo = 2
    Dim pk As Variant, pct As Double, sev As String
    For Each pk In dN.Keys
        If dR(pk) = 0 Or dN(pk) < 10 Then GoTo NP      ' amostra mínima p/ significância
        pct = dR(pk) / dN(pk)
        If pct > FOR_REDONDO_CRIT Then
            sev = "CRITICO"
        ElseIf pct > FOR_REDONDO_ATEN Then
            sev = "ATENCAO"
        Else
            GoTo NP
        End If
        wo.Cells(lo, 1).Value = pk
        wo.Cells(lo, 2).Value = dDen(pk)
        wo.Cells(lo, 3).Value = dN(pk)
        wo.Cells(lo, 4).Value = dR(pk)
        wo.Cells(lo, 5).Value = pct: wo.Cells(lo, 5).NumberFormat = "0.0%"
        wo.Cells(lo, 6).Value = dV(pk): wo.Cells(lo, 6).NumberFormat = "R$ #,##0.00"
        wo.Cells(lo, 7).Value = sev
        wo.Rows(lo).Interior.Color = AudCor(sev)
        lo = lo + 1
NP:
    Next pk
    If lo = 2 Then wo.Cells(2, 1).Value = "Nenhuma concentração anormal de valores redondos identificada."
    wo.Cells(lo + 1, 1).Value = "Base: lançamentos >= R$ 1.000 múltiplos exatos de R$ 1.000. Global: " & nRed & " de " & nTot & " lançamentos."
    wo.Cells(lo + 1, 1).Font.Italic = True: wo.Cells(lo + 1, 1).Font.Size = 9
    wo.Columns("A:G").AutoFit
End Sub

' =============================================================================
' TESTE 22 — LANÇAMENTOS EM FIM DE SEMANA E FERIADOS
'   Lançamento manual fora do expediente é red flag clássico de auditoria.
' =============================================================================
Sub AnalisarFimDeSemana()
    Dim ws As Worksheet, wo As Worksheet
    Set ws = Sheets("DADOS"): Set wo = Sheets("FDS FERIADOS")

    Dim cab As Variant
    cab = Array("USUARIO", "N_LANC_TOTAL", "N_FDS_FERIADO", "PCT", "VALOR_FDS_FERIADO", "CLASSIFICACAO")
    Dim k As Integer
    For k = 0 To UBound(cab): wo.Cells(1, k + 1).Value = cab(k): Next k
    CabecalhoFormatar wo, 1, UBound(cab) + 1, RGB(155, 0, 0)

    If colDATALANC = 0 Then
        wo.Cells(2, 1).Value = "Coluna DATA_LANCAMENTO não encontrada — teste indisponível."
        wo.Columns("A:F").AutoFit: Exit Sub
    End If

    Dim dTot As Object, dFds As Object, dVal As Object
    Set dTot = CreateObject("Scripting.Dictionary")
    Set dFds = CreateObject("Scripting.Dictionary")
    Set dVal = CreateObject("Scripting.Dictionary")

    Dim i As Long, pep As String, usr As String, vl As Double, dt As Date, ehFds As Boolean
    For i = 2 To ultimaLinha
        pep = AudTxt(ws, i, colPEP): If pep = "" Then GoTo NX
        If Not IsDate(ws.Cells(i, colDATALANC).Value) Then GoTo NX
        dt = CDate(ws.Cells(i, colDATALANC).Value)
        vl = AudNum(ws, i, colVALOR)
        usr = AudTxt(ws, i, colUSUARIO): If usr = "" Then usr = "(SEM USUARIO)"
        If Not dTot.Exists(usr) Then dTot(usr) = 0: dFds(usr) = 0: dVal(usr) = 0
        dTot(usr) = dTot(usr) + 1
        ehFds = (Weekday(dt, vbMonday) >= 6) Or EhFeriadoFixo(dt)
        If ehFds Then
            dFds(usr) = dFds(usr) + 1
            dVal(usr) = dVal(usr) + Abs(vl)
        End If
NX:
    Next i

    Dim lo As Long: lo = 2
    Dim pk As Variant, pct As Double, sev As String
    For Each pk In dTot.Keys
        If dFds(pk) = 0 Then GoTo NP
        pct = dFds(pk) / dTot(pk)
        If dFds(pk) >= 5 And pct > 0.1 Then
            sev = "CRITICO"
        Else
            sev = "ATENCAO"
        End If
        wo.Cells(lo, 1).Value = pk
        wo.Cells(lo, 2).Value = dTot(pk)
        wo.Cells(lo, 3).Value = dFds(pk)
        wo.Cells(lo, 4).Value = pct: wo.Cells(lo, 4).NumberFormat = "0.0%"
        wo.Cells(lo, 5).Value = dVal(pk): wo.Cells(lo, 5).NumberFormat = "R$ #,##0.00"
        wo.Cells(lo, 6).Value = sev
        wo.Rows(lo).Interior.Color = AudCor(sev)
        lo = lo + 1
NP:
    Next pk
    If lo = 2 Then wo.Cells(2, 1).Value = "Nenhum lançamento em fim de semana/feriado identificado."
    wo.Cells(lo + 1, 1).Value = "Feriados considerados: fixos nacionais (01/01, 21/04, 01/05, 07/09, 12/10, 02/11, 15/11, 25/12). Lançamentos automáticos (batch) podem gerar falso positivo."
    wo.Cells(lo + 1, 1).Font.Italic = True: wo.Cells(lo + 1, 1).Font.Size = 9
    wo.Columns("A:F").AutoFit
End Sub

' =============================================================================
' TESTE 23 — CUTOFF DE EXERCÍCIO (concentração de custos no fim do ano)
'   Regularizações em bloco em dezembro comprometem competência (CPC 23).
' =============================================================================
Sub AnalisarCutoffExercicio()
    Dim ws As Worksheet, wo As Worksheet
    Set ws = Sheets("DADOS"): Set wo = Sheets("CUTOFF EXERCICIO")

    Dim cab As Variant
    cab = Array("ANO", "VALOR_ANO", "VALOR_DEZEMBRO", "PCT_DEZ", "MEDIA_MENSAL", "RAZAO_DEZ_MEDIA", "CLASSIFICACAO")
    Dim k As Integer
    For k = 0 To UBound(cab): wo.Cells(1, k + 1).Value = cab(k): Next k
    CabecalhoFormatar wo, 1, UBound(cab) + 1, RGB(112, 48, 160)

    If colDATALANC = 0 Then
        wo.Cells(2, 1).Value = "Coluna DATA_LANCAMENTO não encontrada — teste indisponível."
        wo.Columns("A:G").AutoFit: Exit Sub
    End If

    Dim dAno As Object, dDez As Object, dMeses As Object
    Set dAno = CreateObject("Scripting.Dictionary")
    Set dDez = CreateObject("Scripting.Dictionary")
    Set dMeses = CreateObject("Scripting.Dictionary")

    Dim i As Long, pep As String, vl As Double, dt As Date, an As String, mkey As String
    For i = 2 To ultimaLinha
        pep = AudTxt(ws, i, colPEP): If pep = "" Then GoTo NX
        vl = AudNum(ws, i, colVALOR): If vl <= 0 Then GoTo NX
        If Not IsDate(ws.Cells(i, colDATALANC).Value) Then GoTo NX
        dt = CDate(ws.Cells(i, colDATALANC).Value)
        an = CStr(Year(dt))
        If Not dAno.Exists(an) Then dAno(an) = 0: dDez(an) = 0
        dAno(an) = dAno(an) + vl
        If Month(dt) = 12 Then dDez(an) = dDez(an) + vl
        mkey = an & "-" & Format(Month(dt), "00")
        If Not dMeses.Exists(mkey) Then dMeses(mkey) = 0
        dMeses(mkey) = dMeses(mkey) + vl
NX:
    Next i

    ' Meses com movimento por ano (média mensal justa)
    Dim dNM As Object: Set dNM = CreateObject("Scripting.Dictionary")
    Dim mk As Variant
    For Each mk In dMeses.Keys
        an = Left(CStr(mk), 4)
        If Not dNM.Exists(an) Then dNM(an) = 0
        dNM(an) = dNM(an) + 1
    Next mk

    Dim lo As Long: lo = 2
    Dim pk As Variant, pct As Double, med As Double, raz As Double, sev As String
    For Each pk In dAno.Keys
        If dAno(pk) <= 0 Then GoTo NP
        pct = dDez(pk) / dAno(pk)
        med = dAno(pk) / dNM(pk)
        raz = IIf(med > 0, dDez(pk) / med, 0)
        If pct > FOR_DEZ_CRIT Then
            sev = "CRITICO"
        ElseIf pct > FOR_DEZ_ATEN Then
            sev = "ATENCAO"
        Else
            sev = "OK"
        End If
        If dNM(pk) < 6 Then sev = "OK"                 ' ano parcial — sem base p/ concluir
        wo.Cells(lo, 1).Value = pk
        wo.Cells(lo, 2).Value = dAno(pk): wo.Cells(lo, 2).NumberFormat = "R$ #,##0.00"
        wo.Cells(lo, 3).Value = dDez(pk): wo.Cells(lo, 3).NumberFormat = "R$ #,##0.00"
        wo.Cells(lo, 4).Value = pct: wo.Cells(lo, 4).NumberFormat = "0.0%"
        wo.Cells(lo, 5).Value = med: wo.Cells(lo, 5).NumberFormat = "R$ #,##0.00"
        wo.Cells(lo, 6).Value = raz: wo.Cells(lo, 6).NumberFormat = "0.00"
        wo.Cells(lo, 7).Value = sev
        wo.Rows(lo).Interior.Color = AudCor(sev)
        lo = lo + 1
NP:
    Next pk
    wo.Cells(lo + 1, 1).Value = "Referência neutra: dezembro ~8,3% do ano (1/12). Acima de " & Format(FOR_DEZ_ATEN, "0%") & " indica regularização em bloco pré-fechamento."
    wo.Cells(lo + 1, 1).Font.Italic = True: wo.Cells(lo + 1, 1).Font.Size = 9
    wo.Columns("A:G").AutoFit
End Sub

' =============================================================================
' TESTE 24 — FRACIONAMENTO (split de despesas para fugir de alçada)
'   >= 3 documentos distintos, mesmo dia/PEP/usuário, todos abaixo da
'   materialidade, somando acima dela.
' =============================================================================
Sub AnalisarFracionamento()
    Dim ws As Worksheet, wo As Worksheet
    Set ws = Sheets("DADOS"): Set wo = Sheets("FRACIONAMENTO")

    Dim cab As Variant
    cab = Array("PEP_3NIVEL", "USUARIO", "DATA", "N_DOCS", "MAIOR_DOC", "SOMA_DIA", "CLASSIFICACAO", "VALOR_RISCO")
    Dim k As Integer
    For k = 0 To UBound(cab): wo.Cells(1, k + 1).Value = cab(k): Next k
    CabecalhoFormatar wo, 1, UBound(cab) + 1, RGB(197, 90, 17)

    If colDATALANC = 0 Or colNUMDOC = 0 Then
        wo.Cells(2, 1).Value = "Colunas DATA_LANCAMENTO e/ou NUM_DOC não encontradas — teste indisponível."
        wo.Columns("A:H").AutoFit: Exit Sub
    End If

    Dim dSoma As Object, dDocs As Object, dMax As Object
    Set dSoma = CreateObject("Scripting.Dictionary")
    Set dDocs = CreateObject("Scripting.Dictionary")
    Set dMax = CreateObject("Scripting.Dictionary")

    Dim i As Long, pep As String, p3 As String, vl As Double, usr As String, ndoc As String, key As String
    For i = 2 To ultimaLinha
        pep = AudTxt(ws, i, colPEP): If pep = "" Then GoTo NX
        vl = AudNum(ws, i, colVALOR): If vl <= 0 Then GoTo NX
        If Not IsDate(ws.Cells(i, colDATALANC).Value) Then GoTo NX
        ndoc = AudTxt(ws, i, colNUMDOC): If ndoc = "" Then GoTo NX
        p3 = PEP3(pep)
        usr = AudTxt(ws, i, colUSUARIO): If usr = "" Then usr = "(SEM USUARIO)"
        key = p3 & "|" & usr & "|" & Format(CDate(ws.Cells(i, colDATALANC).Value), "yyyy-mm-dd")
        If Not dSoma.Exists(key) Then dSoma(key) = 0: dDocs(key) = "|": dMax(key) = 0
        dSoma(key) = dSoma(key) + vl
        If vl > dMax(key) Then dMax(key) = vl
        If InStr(dDocs(key), "|" & ndoc & "|") = 0 Then dDocs(key) = dDocs(key) & ndoc & "|"
NX:
    Next i

    Dim lo As Long: lo = 2
    Dim kk As Variant, nDocs As Long, parts() As String, sev As String
    For Each kk In dSoma.Keys
        nDocs = 0
        If Len(dDocs(kk)) > 2 Then nDocs = UBound(Split(Mid(dDocs(kk), 2, Len(dDocs(kk)) - 2), "|")) + 1
        If nDocs < FOR_FRAC_NDOC Then GoTo NP
        If dMax(kk) >= MATERIALIDADE Then GoTo NP       ' nenhum doc isolado atinge a alçada
        If dSoma(kk) < MATERIALIDADE Then GoTo NP       ' soma precisa ultrapassar a alçada
        If nDocs >= FOR_FRAC_NDOC_CR Then sev = "CRITICO" Else sev = "ATENCAO"
        parts = Split(CStr(kk), "|")
        wo.Cells(lo, 1).Value = parts(0)
        wo.Cells(lo, 2).Value = parts(1)
        wo.Cells(lo, 3).Value = parts(2)
        wo.Cells(lo, 4).Value = nDocs
        wo.Cells(lo, 5).Value = dMax(kk): wo.Cells(lo, 5).NumberFormat = "R$ #,##0.00"
        wo.Cells(lo, 6).Value = dSoma(kk): wo.Cells(lo, 6).NumberFormat = "R$ #,##0.00"
        wo.Cells(lo, 7).Value = sev
        wo.Cells(lo, 8).Value = dSoma(kk): wo.Cells(lo, 8).NumberFormat = "R$ #,##0.00"
        wo.Rows(lo).Interior.Color = AudCor(sev)
        lo = lo + 1
NP:
    Next kk
    If lo = 2 Then wo.Cells(2, 1).Value = "Nenhum indício de fracionamento identificado."
    wo.Cells(lo + 1, 1).Value = "Critério: >= " & FOR_FRAC_NDOC & " docs no mesmo dia/PEP/usuário, todos < R$ " & Format(MATERIALIDADE, "#,##0") & " e soma acima desse valor."
    wo.Cells(lo + 1, 1).Font.Italic = True: wo.Cells(lo + 1, 1).Font.Size = 9
    wo.Columns("A:H").AutoFit
End Sub

' =============================================================================
' TESTE 25 — LEI DE BENFORD — 2º DÍGITO (MAD, Nigrini 2012)
'   Complementa o 1º dígito: manipulações finas aparecem no 2º dígito.
' =============================================================================
Sub AnalisarBenfordD2()
    Dim ws As Worksheet, wo As Worksheet
    Set ws = Sheets("DADOS"): Set wo = Sheets("BENFORD D2")

    ' Esperado do 2º dígito: P(d) = soma_{k=1..9} log10(1 + 1/(10k+d))
    Dim esp(0 To 9) As Double
    Dim d As Integer, k2 As Integer
    For d = 0 To 9
        For k2 = 1 To 9
            esp(d) = esp(d) + Log(1 + 1# / (10 * k2 + d)) / Log(10)
        Next k2
    Next d

    Dim cnt(0 To 9) As Long, tot As Long
    Dim i As Long, vl As Double, sv As String, sd As Integer
    For i = 2 To ultimaLinha
        vl = AudNum(ws, i, colVALOR)
        If vl < 10 Then GoTo NX                        ' precisa de 2 dígitos
        sv = Format(Fix(Abs(vl)), "0")
        If Len(sv) < 2 Then GoTo NX
        sd = Val(Mid(sv, 2, 1))
        cnt(sd) = cnt(sd) + 1: tot = tot + 1
NX:
    Next i

    wo.Cells(1, 1).Value = "DÍGITO": wo.Cells(1, 2).Value = "FREQ_OBSERVADA"
    wo.Cells(1, 3).Value = "FREQ_ESPERADA": wo.Cells(1, 4).Value = "DIFERENÇA": wo.Cells(1, 5).Value = "ABS_DIF"
    CabecalhoFormatar wo, 1, 5, RGB(68, 114, 196)

    Dim somaAbs As Double, fo As Double, dif As Double
    For d = 0 To 9
        fo = IIf(tot > 0, cnt(d) / tot, 0)
        dif = fo - esp(d)
        wo.Cells(d + 2, 1).Value = d
        wo.Cells(d + 2, 2).Value = fo:      wo.Cells(d + 2, 2).NumberFormat = "0.000%"
        wo.Cells(d + 2, 3).Value = esp(d):  wo.Cells(d + 2, 3).NumberFormat = "0.000%"
        wo.Cells(d + 2, 4).Value = dif:     wo.Cells(d + 2, 4).NumberFormat = "0.000%"
        wo.Cells(d + 2, 5).Value = Abs(dif): wo.Cells(d + 2, 5).NumberFormat = "0.000%"
        somaAbs = somaAbs + Abs(dif)
    Next d

    Dim MAD As Double: MAD = (somaAbs / 10) * 100
    Dim catB As String, corB As Long
    If MAD < FOR_BENF2_CONF Then
        catB = "CONFORMIDADE": corB = RGB(198, 239, 206)
    ElseIf MAD < FOR_BENF2_ACEIT Then
        catB = "ACEITÁVEL": corB = RGB(255, 235, 156)
    ElseIf MAD < FOR_BENF2_LEVE Then
        catB = "LEVE NÃO-CONFORMIDADE": corB = RGB(255, 165, 0)
    Else
        catB = "NÃO-CONFORMIDADE — INVESTIGAR": corB = RGB(255, 100, 100)
    End If

    wo.Cells(13, 1).Value = "MAD 2º dígito (Nigrini 2012):": wo.Cells(13, 1).Font.Bold = True
    wo.Cells(13, 2).Value = MAD: wo.Cells(13, 2).NumberFormat = "0.000": wo.Cells(13, 2).Font.Bold = True
    wo.Cells(13, 3).Value = catB: wo.Cells(13, 3).Font.Bold = True
    wo.Range("A13:C13").Interior.Color = corB
    wo.Cells(14, 1).Value = "Lançamentos analisados (>= R$ 10): " & tot
    wo.Cells(16, 1).Value = "AVISO: desvio no 2º dígito NÃO é prova de fraude — indica priorização de amostra documental."
    wo.Cells(16, 1).Font.Italic = True: wo.Cells(16, 1).Font.Color = RGB(128, 0, 0)
    wo.Columns("A:E").AutoFit
End Sub

' =============================================================================
' TESTE 26 — CONCENTRAÇÃO POR USUÁRIO
'   Um único usuário concentrando o valor lançado enfraquece a segregação
'   de funções (red flag ISA 240 / controles internos).
' =============================================================================
Sub AnalisarUsuarios()
    Dim ws As Worksheet, wo As Worksheet
    Set ws = Sheets("DADOS"): Set wo = Sheets("USUARIOS")

    Dim cab As Variant
    cab = Array("USUARIO", "N_LANC", "N_PEPS", "VALOR_TOTAL", "PARTICIPACAO_%", "CLASSIFICACAO")
    Dim k As Integer
    For k = 0 To UBound(cab): wo.Cells(1, k + 1).Value = cab(k): Next k
    CabecalhoFormatar wo, 1, UBound(cab) + 1, RGB(0, 112, 192)

    If colUSUARIO = 0 Then
        wo.Cells(2, 1).Value = "Coluna USUARIO não encontrada — teste indisponível."
        wo.Columns("A:F").AutoFit: Exit Sub
    End If

    Dim dVal As Object, dCnt As Object, dPeps As Object
    Set dVal = CreateObject("Scripting.Dictionary")
    Set dCnt = CreateObject("Scripting.Dictionary")
    Set dPeps = CreateObject("Scripting.Dictionary")
    Dim totalG As Double

    Dim i As Long, pep As String, p3 As String, vl As Double, usr As String
    For i = 2 To ultimaLinha
        pep = AudTxt(ws, i, colPEP): If pep = "" Then GoTo NX
        vl = AudNum(ws, i, colVALOR): If vl <= 0 Then GoTo NX
        p3 = PEP3(pep)
        usr = AudTxt(ws, i, colUSUARIO): If usr = "" Then usr = "(SEM USUARIO)"
        If Not dVal.Exists(usr) Then dVal(usr) = 0: dCnt(usr) = 0: dPeps(usr) = "|"
        dVal(usr) = dVal(usr) + vl: dCnt(usr) = dCnt(usr) + 1
        totalG = totalG + vl
        If InStr(dPeps(usr), "|" & p3 & "|") = 0 Then dPeps(usr) = dPeps(usr) & p3 & "|"
NX:
    Next i

    ' Ordenar por valor decrescente
    Dim n As Long: n = dVal.Count
    If n = 0 Then
        wo.Cells(2, 1).Value = "Nenhum lançamento com usuário identificado."
        wo.Columns("A:F").AutoFit: Exit Sub
    End If
    Dim aU() As String: ReDim aU(n - 1)
    Dim aV() As Double: ReDim aV(n - 1)
    Dim idx As Long: idx = 0
    Dim uk As Variant
    For Each uk In dVal.Keys: aU(idx) = CStr(uk): aV(idx) = dVal(uk): idx = idx + 1: Next uk
    Dim a As Long, b As Long, ts As String, td As Double
    For a = 0 To n - 2
        For b = a + 1 To n - 1
            If aV(a) < aV(b) Then
                td = aV(a): aV(a) = aV(b): aV(b) = td
                ts = aU(a): aU(a) = aU(b): aU(b) = ts
            End If
        Next b
    Next a

    Dim lo As Long: lo = 2
    Dim part As Double, nP As Long, sev As String
    For idx = 0 To n - 1
        part = IIf(totalG > 0, aV(idx) / totalG, 0)
        nP = 0
        If Len(dPeps(aU(idx))) > 2 Then nP = UBound(Split(Mid(dPeps(aU(idx)), 2, Len(dPeps(aU(idx))) - 2), "|")) + 1
        sev = ""
        If idx = 0 And part > FOR_USR_CRIT Then
            sev = "CRITICO"
        ElseIf idx = 0 And part > FOR_USR_ATEN Then
            sev = "ATENCAO"
        End If
        wo.Cells(lo, 1).Value = aU(idx)
        wo.Cells(lo, 2).Value = dCnt(aU(idx))
        wo.Cells(lo, 3).Value = nP
        wo.Cells(lo, 4).Value = aV(idx): wo.Cells(lo, 4).NumberFormat = "R$ #,##0.00"
        wo.Cells(lo, 5).Value = part: wo.Cells(lo, 5).NumberFormat = "0.0%"
        wo.Cells(lo, 6).Value = sev
        If sev <> "" Then wo.Rows(lo).Interior.Color = AudCor(sev)
        lo = lo + 1
    Next idx
    wo.Cells(lo + 1, 1).Value = "NOTA: usuários batch/integração concentram valor legitimamente — validar segregação de funções apenas para usuários pessoais."
    wo.Cells(lo + 1, 1).Font.Italic = True: wo.Cells(lo + 1, 1).Font.Size = 9
    wo.Columns("A:F").AutoFit
End Sub

' =============================================================================
' TESTE 27 — ESTORNO SEGUIDO DE RELANÇAMENTO COM VALOR ALTERADO
'   Estorno + relançamento com valor 1%-20% diferente em até 30 dias no
'   mesmo PEP/material = indício de ajuste manual de custo.
' =============================================================================
Sub AnalisarEstornoRelanc()
    Dim ws As Worksheet, wo As Worksheet
    Set ws = Sheets("DADOS"): Set wo = Sheets("ESTORNO RELANC")

    Dim cab As Variant
    cab = Array("PEP_3NIVEL", "MATERIAL", "DATA_ESTORNO", "VALOR_ESTORNADO", "DATA_RELANC", "VALOR_RELANC", "DELTA_%", "CLASSIFICACAO", "VALOR_RISCO")
    Dim k As Integer
    For k = 0 To UBound(cab): wo.Cells(1, k + 1).Value = cab(k): Next k
    CabecalhoFormatar wo, 1, UBound(cab) + 1, RGB(192, 0, 0)

    If colDATALANC = 0 Then
        wo.Cells(2, 1).Value = "Coluna DATA_LANCAMENTO não encontrada — teste indisponível."
        wo.Columns("A:I").AutoFit: Exit Sub
    End If

    ' Coletar negativos e positivos por PEP3|MATERIAL (datas como serial Long)
    Dim dNeg As Object, dPos As Object
    Set dNeg = CreateObject("Scripting.Dictionary")
    Set dPos = CreateObject("Scripting.Dictionary")

    Dim i As Long, pep As String, p3 As String, vl As Double, mat As String, km As String, ent As String
    For i = 2 To ultimaLinha
        pep = AudTxt(ws, i, colPEP): If pep = "" Then GoTo NX
        vl = AudNum(ws, i, colVALOR): If vl = 0 Then GoTo NX
        If Not IsDate(ws.Cells(i, colDATALANC).Value) Then GoTo NX
        mat = AudTxt(ws, i, colMATERIAL): If mat = "" Or mat = "0" Then GoTo NX
        p3 = PEP3(pep)
        km = p3 & "|" & mat
        ' Int (não CLng): CLng arredondaria uma data com hora para o dia seguinte.
        ' Str/Val são locale-independentes — CStr/CDbl quebrariam com vírgula decimal.
        ent = CStr(CLng(Int(CDbl(CDate(ws.Cells(i, colDATALANC).Value))))) & ";" & Str(Abs(vl))
        If vl < 0 Then
            If Not dNeg.Exists(km) Then dNeg(km) = ""
            dNeg(km) = IIf(dNeg(km) = "", ent, dNeg(km) & "#" & ent)
        Else
            If Not dPos.Exists(km) Then dPos(km) = ""
            dPos(km) = IIf(dPos(km) = "", ent, dPos(km) & "#" & ent)
        End If
NX:
    Next i

    Dim lo As Long: lo = 2
    Dim kk As Variant, negs() As String, poss() As String
    Dim ni As Long, pi As Long, pn() As String, pp() As String
    Dim dtN As Long, vN As Double, dtP As Long, vP As Double, delta As Double
    Dim parts() As String, sev As String
    For Each kk In dNeg.Keys
        If Not dPos.Exists(kk) Then GoTo NK
        negs = Split(CStr(dNeg(kk)), "#")
        poss = Split(CStr(dPos(kk)), "#")
        For ni = 0 To UBound(negs)
            pn = Split(negs(ni), ";")
            dtN = CLng(pn(0)): vN = Val(pn(1))
            If vN <= 0 Then GoTo NN
            For pi = 0 To UBound(poss)
                pp = Split(poss(pi), ";")
                dtP = CLng(pp(0)): vP = Val(pp(1))
                If dtP >= dtN And dtP <= dtN + FOR_RELANC_DIAS Then
                    delta = Abs(vP - vN) / vN
                    If delta > 0.005 And delta <= FOR_RELANC_DELTA Then
                        If vP > vN Then sev = "CRITICO" Else sev = "ATENCAO"
                        parts = Split(CStr(kk), "|")
                        wo.Cells(lo, 1).Value = parts(0)
                        wo.Cells(lo, 2).Value = parts(1)
                        wo.Cells(lo, 3).Value = CDate(dtN): wo.Cells(lo, 3).NumberFormat = "dd/mm/yyyy"
                        wo.Cells(lo, 4).Value = vN: wo.Cells(lo, 4).NumberFormat = "R$ #,##0.00"
                        wo.Cells(lo, 5).Value = CDate(dtP): wo.Cells(lo, 5).NumberFormat = "dd/mm/yyyy"
                        wo.Cells(lo, 6).Value = vP: wo.Cells(lo, 6).NumberFormat = "R$ #,##0.00"
                        wo.Cells(lo, 7).Value = delta: wo.Cells(lo, 7).NumberFormat = "0.0%"
                        wo.Cells(lo, 8).Value = sev
                        wo.Cells(lo, 9).Value = Abs(vP - vN): wo.Cells(lo, 9).NumberFormat = "R$ #,##0.00"
                        wo.Rows(lo).Interior.Color = AudCor(sev)
                        lo = lo + 1
                        Exit For                        ' 1 par por estorno
                    End If
                End If
            Next pi
NN:
        Next ni
NK:
    Next kk
    If lo = 2 Then wo.Cells(2, 1).Value = "Nenhum estorno seguido de relançamento alterado identificado."
    wo.Cells(lo + 1, 1).Value = "Critério: relançamento em até " & FOR_RELANC_DIAS & " dias com valor 0,5%-" & Format(FOR_RELANC_DELTA, "0%") & " diferente do estornado (mesmo PEP/material)."
    wo.Cells(lo + 1, 1).Font.Italic = True: wo.Cells(lo + 1, 1).Font.Size = 9
    wo.Columns("A:I").AutoFit
End Sub
