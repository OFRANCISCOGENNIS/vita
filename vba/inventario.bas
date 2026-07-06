Attribute VB_Name = "inventario"
Option Explicit

' Cache da faixa de precos (evita reabrir o arquivo externo de 200k+ linhas
' a cada chamada). Vale por execucao; e limpo no inicio de GerarInventario.
Private mFaixaCache As Object

' Etapa atual (p/ diagnostico em caso de erro)
Private mStep As String

' Infra de melhorias: CONFIG editavel, log de execucao e erro granular.
Private mCfg As Object       ' CONFIG: CHAVE -> valor (string)
Private mComCrit As Object   ' tokens normalizados de familia COM critica
Private mLog As Object       ' Collection de linhas do log de execucao
Private mFalhas As String    ' etapas que falharam (erro granular, nao aborta tudo)
Private mT0 As Double        ' Timer no inicio da execucao
Private mTolAder As Double   ' tolerancia de aderencia (fracao) - hot path
Private mCaboMax As Double   ' cabo isolado isento de UC abaixo deste comprimento

' Estrutura de dados para NT.006
Private Type tMaterial
    Familia     As String   ' familia NT.006 (CRUZETA, ISOLADOR PILAR, ...)
    CodNT006    As String   ' codigo NT.006 (R-02, I-05, ...)
    DescrNT006  As String   ' descricao resumida
    EhAncora    As Boolean  ' se True, e referencia para calcular os demais
    AncoraDep   As String   ' familia ancora de que depende (se nao for ancora)
    RazaoMin    As Double   ' razao minima em relacao a ancora
    RazaoMax    As Double   ' razao maxima em relacao a ancora
    DescrRegra  As String   ' texto da regra NT.006
End Type

' Mapa NT.006: codigo SAP -> tMaterial
Private Function CriarMapaNT006() As Object

    Dim d As Object
    Set d = CreateObject("Scripting.Dictionary")

    ' Helper para adicionar entradas
    ' CriarMapaNT006 preenche o dicionario e retorna

    ' === CRUZETAS (ancora) ===
    AddMat d, "133100007", "CRUZETA",        "R-02", "Cruzeta concreto T 1900mm", True, "", 0, 0, ""
    AddMat d, "133100001", "CRUZETA",        "R-02", "Cruzeta concreto L 1700mm", True, "", 0, 0, ""
    AddMat d, "133100006", "CRUZETA",        "R-02", "Cruzeta concreto T 2200mm", True, "", 0, 0, ""
    AddMat d, "133400012", "CRUZETA",        "R-02", "Cruzeta PRFV 90x112,5 2,4m", True, "", 0, 0, ""
    AddMat d, "133400003", "CRUZETA",        "R-02", "Cruzeta PRFV", True, "", 0, 0, ""
    AddMat d, "133400004", "CRUZETA",        "R-02", "Cruzeta PRFV", True, "", 0, 0, ""

    ' === ISOLADOR PILAR: 2-3 por cruzeta (N1 trifasico=3; monofasico=1) ===
    AddMat d, "123140003", "ISOLADOR PILAR", "I-05", "Isolador pilar 15kV M16",     False, "CRUZETA", 2, 3.5, "2-3 iso. pilar por cruzeta (N1=3)"
    AddMat d, "123140016", "ISOLADOR PILAR", "I-05", "Isolador pilar 24,2kV M16",   False, "CRUZETA", 2, 3.5, "2-3 iso. pilar por cruzeta"
    AddMat d, "123140015", "ISOLADOR PILAR", "I-05", "Isolador pilar polim. 25kV",  False, "CRUZETA", 2, 3.5, "2-3 iso. pilar por cruzeta"
    AddMat d, "123140014", "ISOLADOR PILAR", "I-05", "Isolador pilar",              False, "CRUZETA", 2, 3.5, "2-3 iso. pilar por cruzeta"

    ' === ISOLADOR SUSPENSAO (ancora para estruturas U/B) ===
    AddMat d, "123230001", "ISOL SUSPENSAO", "I-06", "Isolador suspensao polim. 15kV", True, "", 0, 0, ""
    AddMat d, "123230002", "ISOL SUSPENSAO", "I-06", "Isolador suspensao",             True, "", 0, 0, ""

    ' === ARRUELA: 2-8 por cruzeta (N1=4; N2/T2/T3/T4=8) ===
    AddMat d, "134830013", "ARRUELA", "A-02", "Arruela quad. 38x38x3mm F18", False, "CRUZETA", 2, 9, "2-8 arruelas por cruzeta (N1=4; N2=8)"
    AddMat d, "134830014", "ARRUELA", "A-02", "Arruela quad. lis 18x50x3mm", False, "CRUZETA", 2, 9, "2-8 arruelas por cruzeta"
    AddMat d, "134830051", "ARRUELA", "A-02", "Arruela red pres M18",        False, "CRUZETA", 2, 9, "2-8 arruelas por cruzeta"

    ' === PARAFUSO: 1-8 por cruzeta (varia por estrutura) ===
    AddMat d, "134700040", "PARAFUSO", "F-30", "Parafuso cab qd 125mm M16x2", False, "CRUZETA", 1, 8, "1-8 parafusos por cruzeta"
    AddMat d, "134700043", "PARAFUSO", "F-30", "Parafuso cab qd 200mm M16x2", False, "CRUZETA", 1, 8, "1-8 parafusos por cruzeta"
    AddMat d, "134700046", "PARAFUSO", "F-30", "Parafuso cab qd 250mm M16x2", False, "CRUZETA", 1, 8, "1-8 parafusos por cruzeta"
    AddMat d, "134700047", "PARAFUSO", "F-30", "Parafuso cab qd 300mm M16x2", False, "CRUZETA", 1, 8, "1-8 parafusos por cruzeta"
    AddMat d, "134700049", "PARAFUSO", "F-30", "Parafuso cab qd 400mm M16x2", False, "CRUZETA", 1, 8, "1-8 parafusos por cruzeta"
    AddMat d, "134700028", "PARAFUSO", "F-30", "Parafuso cab abaul 16x45mm",  False, "CRUZETA", 1, 8, "1-8 parafusos por cruzeta"
    AddMat d, "134700030", "PARAFUSO", "F-30", "Parafuso cab abaul 16x150mm", False, "CRUZETA", 1, 8, "1-8 parafusos por cruzeta"
    AddMat d, "134700082", "PARAFUSO", "F-30", "Parafuso rosca dupla 16x500", False, "CRUZETA", 1, 8, "1-8 parafusos por cruzeta"

    ' === PINO: 2-3 por cruzeta (1 por isolador pilar) ===
    AddMat d, "134280005", "PINO", "F-36", "Pino iso pilar autotrav M16x2", False, "CRUZETA", 2, 3.5, "~3 pinos por cruzeta (1 por isolador pilar)"
    AddMat d, "134280002", "PINO", "F-37", "Pino curto suporte topo",       False, "CRUZETA", 1, 2.5, "1-2 pinos curtos por cruzeta (est. terminal)"

    ' === PORCA: 2-6 por cruzeta ===
    AddMat d, "134800002", "PORCA", "A-21", "Porca quad. M16x2", False, "CRUZETA", 2, 6.5, "2-6 porcas por cruzeta (N2/T2/T3/T4=4)"

    ' === SELA DE CRUZETA: 2-4 por cruzeta ===
    AddMat d, "134380004", "SELA CRUZETA", "-", "Sela cruzeta 110x116mm", False, "CRUZETA", 2, 4, "2-3 selas por cruzeta trifasica"
    AddMat d, "134380005", "SELA CRUZETA", "-", "Sela cruzeta",           False, "CRUZETA", 2, 4, "2-3 selas por cruzeta"

    ' === MAO FRANCESA: 1-2 por cruzeta ===
    AddMat d, "134100006", "MAO FRANCESA", "-", "Mao francesa plana 726x38x5mm", False, "CRUZETA", 0.5, 2.5, "1-2 maos-francesas por cruzeta"

    ' === GANCHO OLHAL (ancora suspensao U/B) ===
    AddMat d, "134250015", "GANCHO OLHAL",   "F-13", "Gancho olhal 5000daN", True, "", 0, 0, ""

    ' === MANILHA / OLHAL: 1:1 com gancho ===
    AddMat d, "134200006", "MANILHA",        "F-22", "Manilha sapatilha 5000daN",   False, "GANCHO OLHAL", 0.8, 1.2, "1 manilha por ponto de suspensao"
    AddMat d, "134250023", "OLHAL PARAFUSO", "-",    "Olhal parafuso M16 5000daN",  False, "GANCHO OLHAL", 0.8, 1.2, "1 olhal por ponto de suspensao"
    AddMat d, "134740023", "PARAFUSO OLHAL", "F-34", "Parafuso olhal M16x250mm",    False, "GANCHO OLHAL", 0.8, 1.2, "1 parafuso olhal por ponto de suspensao"

    ' === HASTE DE ATERRAMENTO (ancora AT) ===
    AddMat d, "134600010", "HASTE TERRA", "F-17", "Haste aco-cobreado 14,3mm 2,4m", True, "", 0, 0, ""
    AddMat d, "134600004", "HASTE TERRA", "F-17", "Haste aco-cobreado 12,7mm 2,4m", True, "", 0, 0, ""

    ' === CONECTOR HASTE: 1:1 com haste ===
    AddMat d, "124140026", "CONEC HASTE", "M-10", "Conector cunha haste 6-16mm",     False, "HASTE TERRA", 0.8, 1.2, "1 conector por haste de aterramento"
    AddMat d, "124140078", "CONEC HASTE", "M-10", "Conector aterramento p/haste",    False, "HASTE TERRA", 0.8, 1.2, "1 conector por haste de aterramento"
    AddMat d, "124140011", "CONEC HASTE", "M-10", "Conector cunha haste",            False, "HASTE TERRA", 0.8, 1.2, "1 conector por haste de aterramento"

    ' === SUPORTE PARA-RAIOS (ancora PR) ===
    AddMat d, "134190064", "SUP PARA-RAIO", "F-47", "Suporte L para-raios 38x205", True, "", 0, 0, ""

    ' === PARA-RAIOS: 1:1 com suporte ===
    AddMat d, "104010001", "PARA-RAIO", "E-29", "Para-raios ZnO 12kV 10kA", False, "SUP PARA-RAIO", 0.8, 1.2, "1 para-raios por suporte (1:1)"
    AddMat d, "104010004", "PARA-RAIO", "E-29", "Para-raios ZnO 15kV",      False, "SUP PARA-RAIO", 0.8, 1.2, "1 para-raios por suporte (1:1)"

    ' === CHAVE FUSIVEL (ancora) ===
    AddMat d, "105300003", "CHAVE FUSIVEL", "E-09", "Chave fusivel 15kV 100A base C", True, "", 0, 0, ""

    ' === TRANSFORMADOR (ancora) ===
    AddMat d, "102100035", "TRAFO", "E-45", "Trafo trifasico 13,8kV 500kVA", True, "", 0, 0, ""
    AddMat d, "102100036", "TRAFO", "E-45", "Trafo trifasico 13,8kV",        True, "", 0, 0, ""
    AddMat d, "102100030", "TRAFO", "E-45", "Trafo monofasico",               True, "", 0, 0, ""

    ' === CONECTOR RAMAL (sem ancora definida - informativo) ===
    AddMat d, "124010010", "CONEC RAMAL", "O-02", "Conector cunha CuEst tipo II",  True, "", 0, 0, ""
    AddMat d, "124010012", "CONEC RAMAL", "O-02", "Conector cunha CuEst tipo III", True, "", 0, 0, ""

    Set CriarMapaNT006 = d

End Function

Private Sub AddMat(d As Object, cod As String, familia As String, nt006 As String, _
                   descr As String, ehAnc As Boolean, ancDep As String, _
                   rMin As Double, rMax As Double, regra As String)
    Dim tm As tMaterial
    tm.Familia    = familia
    tm.CodNT006   = nt006
    tm.DescrNT006 = descr
    tm.EhAncora   = ehAnc
    tm.AncoraDep  = ancDep
    tm.RazaoMin   = rMin
    tm.RazaoMax   = rMax
    tm.DescrRegra = regra
    d.Add cod, tm.Familia & "|" & tm.CodNT006 & "|" & tm.DescrNT006 & "|" & IIf(tm.EhAncora, "1", "0") & "|" & tm.AncoraDep & "|" & Trim$(Str$(tm.RazaoMin)) & "|" & Trim$(Str$(tm.RazaoMax)) & "|" & tm.DescrRegra
End Sub

' Desempacota tMaterial da string no Dictionary
Private Function GetMat(d As Object, cod As String) As tMaterial
    Dim p() As String, tm As tMaterial
    p = Split(CStr(d(cod)), "|")
    tm.Familia    = p(0)
    tm.CodNT006   = p(1)
    tm.DescrNT006 = p(2)
    tm.EhAncora   = (p(3) = "1")
    tm.AncoraDep  = p(4)
    tm.RazaoMin   = Val(p(5))
    tm.RazaoMax   = Val(p(6))
    tm.DescrRegra = p(7)
    GetMat = tm
End Function

' ---------------------------------------------------------------------------
'  HELPERS
' ---------------------------------------------------------------------------
Private Function NormStr(s As String) As String
    ' Upper-case sem acentos (simplificado para os campos relevantes)
    Dim r As String : r = UCase(Trim(s))
    r = Replace(r, ".", "")
    r = Replace(r, "/", "")
    r = Replace(r, "-", "")
    r = Replace(r, "_", "")
    r = Replace(r, Chr(231), "C")   ' c cedilha
    r = Replace(r, Chr(199), "C")   ' C cedilha
    r = Replace(r, Chr(227), "A")   ' a til
    r = Replace(r, Chr(195), "A")   ' A til
    r = Replace(r, Chr(245), "O")   ' o til
    r = Replace(r, Chr(213), "O")   ' O til
    r = Replace(r, Chr(225), "A")   ' a agudo
    r = Replace(r, Chr(193), "A")   ' A agudo
    r = Replace(r, Chr(233), "E")   ' e agudo
    r = Replace(r, Chr(201), "E")   ' E agudo
    r = Replace(r, Chr(237), "I")   ' i agudo
    r = Replace(r, Chr(205), "I")   ' I agudo
    r = Replace(r, Chr(243), "O")   ' o agudo
    r = Replace(r, Chr(211), "O")   ' O agudo
    r = Replace(r, Chr(250), "U")   ' u agudo
    r = Replace(r, Chr(218), "U")   ' U agudo
    r = Replace(r, "  ", " ")
    NormStr = Trim(r)
End Function

Private Function NormCod(v As Variant) As String
    If IsEmpty(v) Or IsNull(v) Then NormCod = "" : Exit Function
    Dim s As String : s = Trim(CStr(v))
    ' Remove ".0" de numeros que o Excel converte em double
    If Right(s, 2) = ".0" Then s = Left(s, Len(s) - 2)
    ' Converte notacao cientifica se necessario
    If InStr(s, "E+") > 0 Or InStr(s, "e+") > 0 Then
        On Error Resume Next
        s = Format$(CDbl(v), "0")
        On Error GoTo 0
    End If
    NormCod = s
End Function

Private Function ToNum(v As Variant) As Double
    If IsEmpty(v) Or IsNull(v) Then ToNum = 0 : Exit Function
    On Error Resume Next
    ToNum = CDbl(v)
    If Err.Number <> 0 Then ToNum = 0
    On Error GoTo 0
End Function
'=============================================================
' INVENTARIO: bloco principal
'=============================================================

Public Sub GerarInventario()

    Set mFaixaCache = Nothing   ' limpa cache de precos para recarregar a base atual

    Dim wb      As Workbook
    Dim wsBase  As Worksheet
    Dim wsDet   As Worksheet
    Dim wsCom   As Worksheet
    Dim wsAlertaC As Worksheet

    Set wb = ActiveWorkbook
    Set wsBase = AcharBaseInventario(wb)

    If wsBase Is Nothing Then
        MsgBox "Nenhuma aba com as colunas 'MAT LIB SAP' e 'MAT PRJ CAD' foi encontrada.", _
               vbExclamation, "Analise Inventario"
        Exit Sub
    End If

    Application.ScreenUpdating = False
    Application.Calculation = xlCalculationManual
    Application.EnableEvents = False
    On Error GoTo ErrHandler

    LogInit
    Call GarantirConfig(wb)
    Dim faltam As String : faltam = ValidarBase(wsBase)
    If faltam <> "" Then
        Application.ScreenUpdating = True
        Application.Calculation = xlCalculationAutomatic
        Application.EnableEvents = True
        MsgBox "A base '" & wsBase.Name & "' esta sem colunas obrigatorias:" & vbCrLf & vbCrLf & _
               "  " & faltam & vbCrLf & vbCrLf & _
               "Ajuste os cabecalhos da linha 1 e rode novamente.", vbCritical, "Analise Inventario"
        Exit Sub
    End If
    LogAdd "CONFIG carregada e base validada: " & wsBase.Name

    Application.DisplayAlerts = False
    On Error Resume Next
    wb.Worksheets("PAINEL DO GESTOR").Delete
    wb.Worksheets("ANALISE SAP x PRJ").Delete
    wb.Worksheets("RESUMO SAP x PRJ").Delete
    wb.Worksheets("RACIONALIZACAO COM").Delete
    wb.Worksheets("ALERTA PEPS SEM UC").Delete
    wb.Worksheets("ALERTA CRITICO").Delete
    wb.Worksheets("SUBSTITUICOES").Delete
    wb.Worksheets("PRECO UNITARIO").Delete
    wb.Worksheets("RANKING DE RISCO").Delete
    On Error GoTo ErrHandler
    Application.DisplayAlerts = True

    Set wsDet = wb.Worksheets.Add(After:=wb.Worksheets(wb.Worksheets.Count))
    wsDet.Name = "ANALISE SAP x PRJ"
    Set wsCom = wb.Worksheets.Add(After:=wb.Worksheets(wb.Worksheets.Count))
    wsCom.Name = "RACIONALIZACAO COM"
    Dim wsPU As Worksheet
    Set wsPU = wb.Worksheets.Add(After:=wb.Worksheets(wb.Worksheets.Count))
    wsPU.Name = "PRECO UNITARIO"
    Set wsAlertaC = wb.Worksheets.Add(After:=wb.Worksheets(wb.Worksheets.Count))
    wsAlertaC.Name = "ALERTA CRITICO"

    ' Cada etapa e isolada: se falhar, registra no log e segue para a proxima
    ' (as demais abas ainda sao geradas), em vez de abortar tudo.
    Dim tt As Double
    Dim wsGestor As Worksheet

    mStep = "ANALISE SAP x PRJ" : tt = Timer : On Error Resume Next : Err.Clear
    Call ProcessarSAPxPRJ(wsBase, wsDet)
    FimEtapa Err.Number, Err.Description, mStep, tt : On Error GoTo ErrHandler

    mStep = "RESUMO SAP x PRJ" : tt = Timer : On Error Resume Next : Err.Clear
    Call ProcessarResumoPEP3(wb, wsDet)
    FimEtapa Err.Number, Err.Description, mStep, tt : On Error GoTo ErrHandler

    mStep = "RACIONALIZACAO COM" : tt = Timer : On Error Resume Next : Err.Clear
    Call ProcessarCOMInventario(wsBase, wsCom)
    FimEtapa Err.Number, Err.Description, mStep, tt : On Error GoTo ErrHandler

    mStep = "PRECO UNITARIO" : tt = Timer : On Error Resume Next : Err.Clear
    Call ProcessarPrecoUnitario(wsBase, wsPU)
    FimEtapa Err.Number, Err.Description, mStep, tt : On Error GoTo ErrHandler

    mStep = "ALERTA CRITICO" : tt = Timer : On Error Resume Next : Err.Clear
    Call ProcessarAlertaCritico(wsBase, wsAlertaC)
    FimEtapa Err.Number, Err.Description, mStep, tt : On Error GoTo ErrHandler

    mStep = "RANKING DE RISCO" : tt = Timer : On Error Resume Next : Err.Clear
    Call ProcessarRankingRisco(wb, wsDet, wsCom, wsPU, wsAlertaC)
    FimEtapa Err.Number, Err.Description, mStep, tt : On Error GoTo ErrHandler

    mStep = "PAINEL DO GESTOR" : tt = Timer : On Error Resume Next : Err.Clear
    Set wsGestor = ProcessarPainelGestor(wb, wsBase, wsDet, wsPU, wsAlertaC)
    FimEtapa Err.Number, Err.Description, mStep, tt : On Error GoTo ErrHandler

    mStep = "DESIGN GLOBAL" : tt = Timer : On Error Resume Next : Err.Clear
    Call AplicarDesignGlobal(wb)
    FimEtapa Err.Number, Err.Description, mStep, tt : On Error GoTo ErrHandler

    mStep = "HISTORICO" : tt = Timer : On Error Resume Next : Err.Clear
    Call AtualizarHistorico(wb)
    FimEtapa Err.Number, Err.Description, mStep, tt : On Error GoTo ErrHandler

    mStep = "NOMES DEFINIDOS" : tt = Timer : On Error Resume Next : Err.Clear
    Call CriarNomesDefinidos(wb)
    FimEtapa Err.Number, Err.Description, mStep, tt : On Error GoTo ErrHandler

    LogAdd "Fim da geracao"
    Call GravarLog(wb)

    Application.ScreenUpdating = True
    Application.Calculation = xlCalculationAutomatic
    Application.EnableEvents = True

    On Error Resume Next
    wsGestor.Activate
    wsGestor.Range("A1").Select
    On Error GoTo 0

    Dim msgFim As String
    msgFim = "Abas geradas:" & vbCrLf & _
           "  - PAINEL DO GESTOR (resumo executivo)" & vbCrLf & _
           "  - ANALISE SAP x PRJ" & vbCrLf & _
           "  - RESUMO SAP x PRJ (1 linha por obra)" & vbCrLf & _
           "  - RACIONALIZACAO COM (NT.006)" & vbCrLf & _
           "  - PRECO UNITARIO (faixa MIN/MAX)" & vbCrLf & _
           "  - ALERTA CRITICO" & vbCrLf & _
           "  - RANKING DE RISCO (score por obra)" & vbCrLf & _
           "  - CONFIG / HISTORICO (parametros e evolucao)" & vbCrLf & vbCrLf & _
           "Base: " & wsBase.Name
    If mFalhas <> "" Then
        MsgBox msgFim & vbCrLf & vbCrLf & _
               "ATENCAO - etapas com falha (as demais foram geradas):" & mFalhas, _
               vbExclamation, "Analise Inventario"
    Else
        MsgBox msgFim, vbInformation, "Analise Inventario"
    End If
    Exit Sub

ErrHandler:
    Application.ScreenUpdating = True
    Application.Calculation = xlCalculationAutomatic
    Application.EnableEvents = True
    Application.DisplayAlerts = True
    MsgBox "Erro " & Err.Number & " na etapa [" & mStep & "]:" & vbCrLf & _
           Err.Description, vbCritical, "Analise Inventario"
End Sub


Private Sub ProcessarSAPxPRJ(wsBase As Worksheet, wsDet As Worksheet)

    Dim azul As Long, verde As Long
    azul = RGB(10, 37, 64)
    verde = RGB(0, 179, 136)

    Dim HR As Long, DS As Long
    HR = 9
    DS = 10

    Dim outHdr As Variant
    outHdr = Array("PEP3NIVEL", "PEP4NIVEL", "NOTA", "CLASSE", "COD MAT", "VALOR", _
                   "DESC MAT", "UND", "MAT LIB SAP", "MAT PRJ CAD", "TIPO", "FAMILIA", "SIT MAT", "APROVACAO", "MOTIVO", "MOTIVO DEVOLUCAO PEP3")
    Dim nCols As Long : nCols = 16

    Dim lastC As Long
    lastC = wsBase.Cells(1, wsBase.Columns.Count).End(xlToLeft).Column

    Dim srcIdx(1 To 16) As Long
    Dim oc As Long, c As Long, hb As String, ho As String
    For oc = 1 To nCols
        ho = NormStr(CStr(outHdr(oc - 1)))
        For c = 1 To lastC
            hb = NormStr(CStr(wsBase.Cells(1, c).Value))
            If hb = ho Then srcIdx(oc) = c : Exit For
        Next c
    Next oc

    Dim refCol As Long : refCol = srcIdx(5)
    If refCol = 0 Then refCol = 1
    Dim lastRow As Long
    lastRow = wsBase.Cells(wsBase.Rows.Count, refCol).End(xlUp).Row

    Dim nRows As Long : nRows = 0
    Dim nPep4 As Long, nAprov As Long, nReprov As Long
    Dim sumValor As Double, sumNaoAder As Double
    Dim dot As String, okIco As String, noIco As String
    dot = ChrW(&H25CF)
    okIco = ChrW(&H2705)
    noIco = ChrW(&H274C)

    If lastRow >= 2 Then
        Dim baseData As Variant
        baseData = wsBase.Range(wsBase.Cells(2, 1), wsBase.Cells(lastRow, lastC)).Value
        nRows = lastRow - 1

        Dim aprova As Object : Set aprova = CreateObject("Scripting.Dictionary")
        Dim temUC As Object : Set temUC = CreateObject("Scripting.Dictionary")
        Dim allP4 As Object : Set allP4 = CreateObject("Scripting.Dictionary")
        Dim p4pep3 As Object : Set p4pep3 = CreateObject("Scripting.Dictionary")
        Dim pep3RepFam As Object : Set pep3RepFam = CreateObject("Scripting.Dictionary")  ' PEP3 -> familias que reprovaram
        Dim i As Long, pep4 As String, tipoR As String, sitR As String, pep3R As String
        Dim famR As String, famRaw As String, ehAder As Boolean, libV As Variant, prjV As Variant
        For i = 1 To nRows
            pep4 = "" : tipoR = "" : sitR = "" : famR = "" : famRaw = "" : pep3R = ""
            If srcIdx(2) > 0 Then pep4 = NormStr(CStr(baseData(i, srcIdx(2))))
            If srcIdx(1) > 0 Then pep3R = NormStr(CStr(baseData(i, srcIdx(1))))
            If srcIdx(11) > 0 Then tipoR = NormStr(CStr(baseData(i, srcIdx(11))))
            If srcIdx(13) > 0 Then sitR = NormStr(CStr(baseData(i, srcIdx(13))))
            If srcIdx(12) > 0 Then famR = NormStr(CStr(baseData(i, srcIdx(12))))
            If srcIdx(12) > 0 Then famRaw = Trim(CStr(baseData(i, srcIdx(12))))
            libV = "" : prjV = ""
            If srcIdx(9) > 0 Then libV = baseData(i, srcIdx(9))
            If srcIdx(10) > 0 Then prjV = baseData(i, srcIdx(10))
            ehAder = EhAderente(famR, libV, prjV, sitR)
            If pep4 <> "" And Not allP4.Exists(pep4) Then allP4.Add pep4, True
            If pep4 <> "" And Not p4pep3.Exists(pep4) Then p4pep3.Add pep4, pep3R
            ' UC sempre avalia; COM avalia apenas se for familia critica (CH FUS / PARA RAIO)
            Dim ehAvaliavel As Boolean
            ehAvaliavel = (tipoR = "UC") Or (tipoR = "COM" And EhComCritico(famR))
            If pep4 <> "" And ehAvaliavel And Not CaboComoCOM(famR, libV) Then
                If Not temUC.Exists(pep4) Then temUC.Add pep4, True
                If Not aprova.Exists(pep4) Then aprova.Add pep4, True
                If Not ehAder And sitR <> "NULO" Then
                    aprova(pep4) = False
                    ' registra a familia culpada no PEP3 (sem duplicar)
                    Dim fLbl As String : fLbl = IIf(famRaw <> "", famRaw, "(sem familia)")
                    If Not pep3RepFam.Exists(pep3R) Then
                        pep3RepFam.Add pep3R, fLbl
                    ElseIf InStr(pep3RepFam(pep3R), fLbl) = 0 Then
                        pep3RepFam(pep3R) = pep3RepFam(pep3R) & ", " & fLbl
                    End If
                End If
            End If
            If srcIdx(6) > 0 Then
                Dim vv As Double : vv = 0
                If IsNumeric(baseData(i, srcIdx(6))) Then vv = CDbl(baseData(i, srcIdx(6)))
                sumValor = sumValor + vv
                If Not ehAder And sitR <> "NULO" Then sumNaoAder = sumNaoAder + Abs(vv)
            End If
        Next i

        nPep4 = allP4.Count

        ' Rollup PEP3: se qualquer PEP4 do PEP3 reprova, todo o PEP3 reprova
        Dim pep3Rep As Object : Set pep3Rep = CreateObject("Scripting.Dictionary")
        Dim pep3UC As Object : Set pep3UC = CreateObject("Scripting.Dictionary")
        Dim k4 As Variant, p3 As String
        For Each k4 In temUC.Keys
            p3 = CStr(p4pep3(k4))
            If Not pep3UC.Exists(p3) Then pep3UC.Add p3, True
            If Not pep3Rep.Exists(p3) Then pep3Rep.Add p3, False
            If Not aprova(k4) Then pep3Rep(p3) = True
        Next k4

        Dim kk As Variant
        For Each kk In pep3Rep.Keys
            If pep3Rep(kk) Then nReprov = nReprov + 1 Else nAprov = nAprov + 1
        Next kk

        Dim outArr() As Variant : ReDim outArr(1 To nRows, 1 To nCols)
        ' Helpers p/ KPIs DINAMICOS (escritos nas colunas ocultas AE:AH):
        ' 1=1a linha do PEP4 | 2=1a linha do PEP3 avaliavel | 3=PEP3 reprovado | 4=valor nao aderente
        Dim hlp() As Double : ReDim hlp(1 To nRows, 1 To 4)
        Dim seen4 As Object : Set seen4 = CreateObject("Scripting.Dictionary")
        Dim seen3 As Object : Set seen3 = CreateObject("Scripting.Dictionary")
        Dim pk As String, rawSit As String
        For i = 1 To nRows
            For oc = 1 To nCols
                If oc <> 13 And oc <> 14 And oc <> 15 And srcIdx(oc) > 0 Then outArr(i, oc) = baseData(i, srcIdx(oc))
            Next oc
            rawSit = "" : sitR = "" : famR = ""
            If srcIdx(13) > 0 Then rawSit = Trim(CStr(baseData(i, srcIdx(13))))
            sitR = NormStr(rawSit)
            If srcIdx(12) > 0 Then famR = NormStr(CStr(baseData(i, srcIdx(12))))
            libV = "" : prjV = ""
            If srcIdx(9) > 0 Then libV = baseData(i, srcIdx(9))
            If srcIdx(10) > 0 Then prjV = baseData(i, srcIdx(10))
            Dim sitText As String
            If (Left(famR, 4) = "COND" Or Left(famR, 4) = "CABO" Or famR = "RAMAL") And IsNumeric(libV) And IsNumeric(prjV) Then
                sitText = IIf(EhAderente(famR, libV, prjV, sitR), "ADERENTE", "NAO ADERENTE")
            Else
                sitText = rawSit
            End If
            outArr(i, 13) = dot & " " & sitText
            Dim p3row As String : p3row = ""
            If srcIdx(1) > 0 Then p3row = NormStr(CStr(baseData(i, srcIdx(1))))

            ' TIPO e aderencia deste item (para motivo detalhado)
            Dim tipoRow As String : tipoRow = ""
            If srcIdx(11) > 0 Then tipoRow = NormStr(CStr(baseData(i, srcIdx(11))))
            Dim ehAderRow As Boolean : ehAderRow = EhAderente(famR, libV, prjV, sitR)

            ' PRIORIDADE 1: se o PEP3 esta reprovado, TODA linha vira REPROVADO
            ' (inclusive CABO ISOLADO que seria isento) - arrastado pela reprovacao do PEP3.
            ' Nota: And do VBA NAO curto-circuita; acessar chave inexistente de
            ' Scripting.Dictionary CRIA a chave. Por isso o teste e aninhado.
            Dim motivo As String
            Dim p3Reprovado As Boolean : p3Reprovado = False
            If pep3UC.Exists(p3row) Then p3Reprovado = CBool(pep3Rep(p3row))
            If p3Reprovado Then
                outArr(i, 14) = noIco & " REPROVADO"
                If tipoRow = "UC" And Not ehAderRow And sitR <> "NULO" Then
                    motivo = "Este item (UC) nao aderente: SAP=" & CStr(libV) & " / PRJ=" & CStr(prjV) & FmtDif(libV, prjV)
                ElseIf tipoRow = "COM" And EhComCritico(famR) And Not ehAderRow And sitR <> "NULO" Then
                    motivo = "Este item (COM critico - " & famR & ") nao aderente: SAP=" & CStr(libV) & " / PRJ=" & CStr(prjV) & FmtDif(libV, prjV)
                ElseIf CaboComoCOM(famR, libV) Then
                    motivo = "Cabo isolado arrastado | Familia reprovada: " & pep3RepFam(p3row)
                Else
                    motivo = "Arrastado pela reprovacao do PEP3 | Familia reprovada: " & pep3RepFam(p3row)
                End If
            ElseIf CaboComoCOM(famR, libV) Then
                outArr(i, 14) = okIco & " APROVADO"
                motivo = "Cabo isolado < 15m - isento de UC"
            ElseIf Not pep3UC.Exists(p3row) Then
                outArr(i, 14) = "SEM UC"
                motivo = "PEP3 sem UC nem COM critico (CH FUS/PARA RAIO) p/ avaliar"
            Else
                outArr(i, 14) = okIco & " APROVADO"
                motivo = "Todos os itens avaliados do PEP3 aderentes"
            End If
            outArr(i, 15) = motivo
            outArr(i, 16) = IIf(p3Reprovado, "Devolvido por divergencia de " & pep3RepFam(p3row), "")

            ' --- helpers dos KPIs dinamicos ---
            Dim p4key As String : p4key = ""
            If srcIdx(2) > 0 Then p4key = NormStr(CStr(baseData(i, srcIdx(2))))
            If p4key <> "" Then
                If Not seen4.Exists(p4key) Then seen4.Add p4key, True : hlp(i, 1) = 1
            End If
            If p3row <> "" Then
                If pep3UC.Exists(p3row) Then
                    If Not seen3.Exists(p3row) Then
                        seen3.Add p3row, True
                        hlp(i, 2) = 1
                        If p3Reprovado Then hlp(i, 3) = 1
                    End If
                End If
            End If
            If srcIdx(6) > 0 Then
                If InStr(NormStr(sitText), "NAO ADER") > 0 Then hlp(i, 4) = Abs(Val0(baseData(i, srcIdx(6))))
            End If
        Next i
        wsDet.Range(wsDet.Cells(DS, 1), wsDet.Cells(DS + nRows - 1, nCols)).Value = outArr

        ' Colunas auxiliares OCULTAS (fora do AutoFilter A:P):
        ' AD=VIS (1 se a linha esta visivel no filtro), AE..AH = helpers acima.
        ' VIS usa SUBTOTAL(102) sobre AE, que e sempre numerica (robusto a vazios).
        wsDet.Range(wsDet.Cells(DS, 31), wsDet.Cells(DS + nRows - 1, 34)).Value = hlp
        wsDet.Range(wsDet.Cells(DS, 30), wsDet.Cells(DS + nRows - 1, 30)).Formula = _
            "=SUBTOTAL(102,$AE" & DS & ")"
        wsDet.Cells(HR, 30).Value = "vis" : wsDet.Cells(HR, 31).Value = "p4"
        wsDet.Cells(HR, 32).Value = "p3" : wsDet.Cells(HR, 33).Value = "rep"
        wsDet.Cells(HR, 34).Value = "vna"
        wsDet.Range(wsDet.Cells(HR, 30), wsDet.Cells(HR, 34)).Font.Color = RGB(200, 200, 200)
        wsDet.Range(wsDet.Columns(30), wsDet.Columns(34)).Hidden = True
    End If

    On Error Resume Next

    With wsDet.Range("A1:P2")
        .Merge
        .Value = ChrW(&H26A1) & " ANALISE SAP x PROJETO"
        .Font.Name = "Segoe UI" : .Font.Size = 20 : .Font.Bold = True
        .Font.Color = RGB(255, 255, 255)
        .Interior.Color = azul
        .HorizontalAlignment = xlLeft : .VerticalAlignment = xlCenter
        .IndentLevel = 1
    End With
    With wsDet.Range("A3:P3")
        .Merge
        .Value = "Inventario Inteligente  |  Atualizacao: " & Format(Now, "dd" & Chr(47) & "mm" & Chr(47) & "yyyy hh:nn") & "  |  Os cards reagem aos filtros"
        .Font.Name = "Segoe UI" : .Font.Size = 9 : .Font.Italic = True
        .Font.Color = RGB(255, 255, 255)
        .Interior.Color = verde
        .HorizontalAlignment = xlLeft : .VerticalAlignment = xlCenter
        .IndentLevel = 1
    End With
    wsDet.Rows(1).RowHeight = 20 : wsDet.Rows(2).RowHeight = 20
    wsDet.Rows(3).RowHeight = 16 : wsDet.Rows(4).RowHeight = 6

    Dim cardCol As Variant, cardLbl As Variant, cardVal As Variant, cardClr As Variant
    cardCol = Array(1, 4, 7, 10, 13)
    cardLbl = Array("ODs (PEP4)", "PEP3 APROVADOS", "PEP3 REPROVADOS", "VALOR SAP", "VALOR NAO ADER.")
    Dim pctA As Double, pctR As Double, denom As Long
    denom = nAprov + nReprov
    If denom > 0 Then
        pctA = nAprov/denom
        pctR = nReprov/denom
    End If
    cardVal = Array(Format(nPep4, "#,##0"), Format(pctA, "0%"), Format(pctR, "0%"), _
                    FmtKPI(sumValor), FmtKPI(sumNaoAder))
    cardClr = Array(azul, verde, RGB(192, 0, 0), azul, RGB(192, 87, 0))
    Dim cidx As Long, cc As Long
    For cidx = 0 To 4
        cc = cardCol(cidx)
        With wsDet.Range(wsDet.Cells(5, cc), wsDet.Cells(5, cc + 1))
            .Merge : .Value = cardLbl(cidx)
            .Font.Name = "Segoe UI" : .Font.Size = 9 : .Font.Bold = True
            .Font.Color = RGB(255, 255, 255) : .Interior.Color = cardClr(cidx)
            .HorizontalAlignment = xlCenter : .VerticalAlignment = xlCenter
        End With
        With wsDet.Range(wsDet.Cells(6, cc), wsDet.Cells(6, cc + 1))
            .Merge : .Value = cardVal(cidx)
            .Font.Name = "Segoe UI" : .Font.Size = 18 : .Font.Bold = True
            .Font.Color = cardClr(cidx) : .Interior.Color = RGB(248, 249, 250)
            .HorizontalAlignment = xlCenter : .VerticalAlignment = xlCenter
            .Borders.LineStyle = xlContinuous : .Borders.Color = RGB(220, 220, 220)
        End With
    Next cidx
    wsDet.Rows(5).RowHeight = 16 : wsDet.Rows(6).RowHeight = 34
    wsDet.Rows(7).RowHeight = 6

    ' KPIs DINAMICOS: os cards reagem ao AutoFilter. As formulas usam as
    ' colunas auxiliares ocultas (AD:AH) escritas junto com os dados.
    If nRows > 0 Then
        Dim ultL As String : ultL = CStr(DS + nRows - 1)
        Dim rVis As String : rVis = "$AD$" & DS & ":$AD$" & ultL
        Dim rP4 As String  : rP4 = "$AE$" & DS & ":$AE$" & ultL
        Dim rP3 As String  : rP3 = "$AF$" & DS & ":$AF$" & ultL
        Dim rRep As String : rRep = "$AG$" & DS & ":$AG$" & ultL
        Dim rVna As String : rVna = "$AH$" & DS & ":$AH$" & ultL
        Dim fmtRS As String
        fmtRS = "[>=1000000]""R$"" #,##0.0,,"" MM"";[>=1000]""R$"" #,##0.0,"" mil"";""R$"" #,##0.00"
        With wsDet.Cells(6, 1)   ' ODs (PEP4) visiveis
            .Formula = "=SUMPRODUCT(" & rVis & "," & rP4 & ")"
            .NumberFormat = "#,##0"
        End With
        With wsDet.Cells(6, 4)   ' % PEP3 aprovados (entre os visiveis)
            .Formula = "=IFERROR((SUMPRODUCT(" & rVis & "," & rP3 & ")-SUMPRODUCT(" & _
                       rVis & "," & rRep & "))/SUMPRODUCT(" & rVis & "," & rP3 & "),0)"
            .NumberFormat = "0%"
        End With
        With wsDet.Cells(6, 7)   ' % PEP3 reprovados (entre os visiveis)
            .Formula = "=IFERROR(SUMPRODUCT(" & rVis & "," & rRep & ")/SUMPRODUCT(" & _
                       rVis & "," & rP3 & "),0)"
            .NumberFormat = "0%"
        End With
        With wsDet.Cells(6, 10)  ' Valor SAP visivel
            .Formula = "=SUBTOTAL(109,$F$" & DS & ":$F$" & ultL & ")"
            .NumberFormat = fmtRS
        End With
        With wsDet.Cells(6, 13)  ' Valor nao aderente visivel
            .Formula = "=SUMPRODUCT(" & rVis & "," & rVna & ")"
            .NumberFormat = fmtRS
        End With
    End If

    Dim navCol As Variant, navTxt As Variant, navSheet As Variant
    navCol = Array(1, 5, 9)
    navTxt = Array("SAP x PROJETO", "RACIONALIZACAO COM", "ALERTAS CRITICOS")
    navSheet = Array("ANALISE SAP x PRJ", "RACIONALIZACAO COM", "ALERTA CRITICO")
    Dim ni As Long
    For ni = 0 To 2
        With wsDet.Range(wsDet.Cells(8, navCol(ni)), wsDet.Cells(8, navCol(ni) + 3))
            .Merge
            .Interior.Color = IIf(ni = 0, verde, azul)
            .Borders.LineStyle = xlContinuous : .Borders.Color = RGB(255, 255, 255)
        End With
        wsDet.Hyperlinks.Add Anchor:=wsDet.Cells(8, navCol(ni)), Address:="", _
            SubAddress:="'" & navSheet(ni) & "'!A1", TextToDisplay:=navTxt(ni)
        With wsDet.Cells(8, navCol(ni))
            .Font.Name = "Segoe UI" : .Font.Size = 10 : .Font.Bold = True
            .Font.Color = RGB(255, 255, 255) : .Font.Underline = xlUnderlineStyleNone
            .HorizontalAlignment = xlCenter : .VerticalAlignment = xlCenter
        End With
    Next ni
    wsDet.Rows(8).RowHeight = 24
    On Error GoTo 0

    For oc = 1 To nCols
        With wsDet.Cells(HR, oc)
            .Value = outHdr(oc - 1)
            .Font.Name = "Segoe UI" : .Font.Bold = True : .Font.Size = 10
            .Font.Color = RGB(255, 255, 255)
            Select Case oc
                Case 9:  .Interior.Color = RGB(0, 128, 0)
                Case 10: .Interior.Color = RGB(255, 25, 25)
                Case 13: .Interior.Color = RGB(89, 89, 89)
                Case 15: .Interior.Color = RGB(112, 48, 160)
                Case 16: .Interior.Color = RGB(192, 0, 0)
                Case Else: .Interior.Color = azul
            End Select
            .HorizontalAlignment = xlCenter : .VerticalAlignment = xlCenter
            .Borders.LineStyle = xlContinuous : .Borders.Color = RGB(170, 170, 170)
        End With
    Next oc
    wsDet.Rows(HR).RowHeight = 26

    Dim widths As Variant
    widths = Array(24.6, 26.6, 10.6, 11.7, 10.6, 11, 50.8, 5.2, 13.4, 14.5, 5.5, 24.3, 18, 15, 48, 48)
    For oc = 1 To nCols
        wsDet.Columns(oc).ColumnWidth = widths(oc - 1)
    Next oc

    If nRows > 0 Then
        Dim lastD As Long : lastD = DS + nRows - 1
        With wsDet.Range(wsDet.Cells(DS, 1), wsDet.Cells(lastD, nCols))
            .Font.Name = "Segoe UI" : .Font.Size = 9
            .VerticalAlignment = xlCenter
            .Borders.LineStyle = xlContinuous : .Borders.Color = RGB(225, 225, 225)
        End With

        On Error Resume Next
        Dim bRng As Range : Set bRng = wsDet.Range(wsDet.Cells(DS, 1), wsDet.Cells(lastD, 11))
        bRng.FormatConditions.Delete
        With bRng.FormatConditions.Add(xlExpression, , "MOD(ROW(),2)=0")
            .Interior.Color = RGB(244, 247, 250)
        End With

        Dim fL As Range : Set fL = wsDet.Range(wsDet.Cells(DS, 12), wsDet.Cells(lastD, 12))
        fL.FormatConditions.Delete
        Dim r0 As String : r0 = "$L" & DS
        With fL.FormatConditions.Add(xlExpression, , "ISNUMBER(SEARCH(""ARMA""," & r0 & "))")
            .Interior.Color = RGB(189, 215, 238)
        End With
        With fL.FormatConditions.Add(xlExpression, , "ISNUMBER(SEARCH(""CRUZETA""," & r0 & "))")
            .Interior.Color = RGB(198, 239, 206)
        End With
        With fL.FormatConditions.Add(xlExpression, , "ISNUMBER(SEARCH(""ISOLADOR""," & r0 & "))")
            .Interior.Color = RGB(225, 213, 231)
        End With
        With fL.FormatConditions.Add(xlExpression, , "ISNUMBER(SEARCH(""TRAFO""," & r0 & "))")
            .Interior.Color = RGB(252, 228, 214)
        End With
        With fL.FormatConditions.Add(xlExpression, , "ISNUMBER(SEARCH(""POSTE""," & r0 & "))")
            .Interior.Color = RGB(217, 217, 217)
        End With

        Dim sR As Range : Set sR = wsDet.Range(wsDet.Cells(DS, 13), wsDet.Cells(lastD, 13))
        sR.FormatConditions.Delete
        Dim rm As String : rm = "$M" & DS
        With sR.FormatConditions.Add(xlExpression, , "ISNUMBER(SEARCH(""NAO ADER""," & rm & "))")
            .Interior.Color = RGB(255, 199, 206) : .Font.Color = RGB(156, 0, 6) : .StopIfTrue = True
        End With
        With sR.FormatConditions.Add(xlExpression, , "ISNUMBER(SEARCH(""NULO""," & rm & "))")
            .Interior.Color = RGB(255, 235, 156) : .Font.Color = RGB(156, 87, 0) : .StopIfTrue = True
        End With
        With sR.FormatConditions.Add(xlExpression, , "ISNUMBER(SEARCH(""ADERENTE""," & rm & "))")
            .Interior.Color = RGB(198, 239, 206) : .Font.Color = RGB(0, 97, 0)
        End With
        sR.HorizontalAlignment = xlCenter

        ' APROVACAO: coloracao DIRETA (FC com formula em ingles falha no Excel PT-BR).
        ' Le o veredito do array em memoria (sem reler a planilha) e pinta BLOCOS
        ' de linhas consecutivas com o mesmo status - 1 chamada por bloco.
        Dim rrA As Long, rIni As Long, avA As String
        wsDet.Range(wsDet.Cells(DS, 14), wsDet.Cells(lastD, 14)).HorizontalAlignment = xlCenter
        rrA = DS
        Do While rrA <= lastD
            avA = CStr(outArr(rrA - DS + 1, 14))
            rIni = rrA
            Do While rrA < lastD
                If CStr(outArr(rrA - DS + 2, 14)) <> avA Then Exit Do
                rrA = rrA + 1
            Loop
            With wsDet.Range(wsDet.Cells(rIni, 14), wsDet.Cells(rrA, 14))
                If InStr(avA, "REPROVADO") > 0 Then
                    .Interior.Color = RGB(192, 0, 0) : .Font.Color = RGB(255, 255, 255) : .Font.Bold = True
                ElseIf InStr(avA, "APROVADO") > 0 Then
                    .Interior.Color = RGB(0, 176, 80) : .Font.Color = RGB(255, 255, 255) : .Font.Bold = True
                Else
                    .Interior.Color = RGB(217, 217, 217) : .Font.Color = RGB(64, 64, 64)
                End If
            End With
            rrA = rrA + 1
        Loop

        Dim vR As Range : Set vR = wsDet.Range(wsDet.Cells(DS, 6), wsDet.Cells(lastD, 6))
        vR.FormatConditions.Delete
        With vR.FormatConditions.AddDatabar
            .BarColor.Color = RGB(0, 179, 136)
            .BarFillType = xlDataBarFillGradient
        End With

        Dim cRng As Range : Set cRng = wsDet.Range(wsDet.Cells(DS, 1), wsDet.Cells(lastD, nCols))
        Dim corte As Double : corte = CfgD("CORTE_DIVERG_QTD", 20)
        With cRng.FormatConditions.Add(xlExpression, , "OR($J" & DS & ">" & corte & ",$I" & DS & "<-" & corte & ")")
            .Interior.Color = RGB(192, 0, 0) : .Font.Color = RGB(255, 255, 255) : .Font.Bold = True
            .SetFirstPriority
        End With
        On Error GoTo 0
    End If

    wsDet.Activate
    On Error Resume Next
    ActiveWindow.FreezePanes = False
    wsDet.Cells(DS, 1).Select
    ActiveWindow.FreezePanes = True
    wsDet.Range(wsDet.Cells(HR, 1), wsDet.Cells(HR, nCols)).AutoFilter
    On Error GoTo 0
    wsDet.Cells(HR, 1).Select

End Sub

' CABO ISOLADO tratado como COM (isento) quando MAT LIB SAP < 15 metros
Private Function CaboComoCOM(fam As String, libV As Variant) As Boolean
    If fam = "CABO ISOLADO" And IsNumeric(libV) Then
        Dim mx As Double : mx = mCaboMax : If mx <= 0 Then mx = 15
        CaboComoCOM = (Abs(CDbl(libV)) < mx)
    Else
        CaboComoCOM = False
    End If
End Function

' Materiais TIPO=COM que, se NAO aderentes, reprovam o PEP3NIVEL inteiro.
' Sao apenas: CH FUS, PARA RAIO BT, PARA RAIO MT.
' famNorm ja vem normalizado (UCase, sem espacos/pontos/acentos).
Private Function EhComCritico(famNorm As String) As Boolean
    ' Remove espacos p/ casar "CH FUS", "PARA RAIO MT", "PARA RAIO BT", "PARA-RAIO" etc.
    Dim f As String : f = Replace(famNorm, " ", "")
    ' Lista configuravel (aba CONFIG, chave COM_CRITICO). Sem config -> fallback fixo.
    If mComCrit Is Nothing Then
        EhComCritico = (InStr(f, "CHFUS") > 0 Or InStr(f, "CHAVEFUS") > 0 Or InStr(f, "PARARAIO") > 0)
        Exit Function
    End If
    Dim k As Variant
    For Each k In mComCrit.Keys
        If InStr(f, CStr(k)) > 0 Then EhComCritico = True : Exit Function
    Next k
End Function

' Match por PALAVRA inteira (evita falso positivo de substring:
' "ELO" em PARALELO, "ANEL" em PAINEL etc.). Virgulas/parenteses viram
' separadores. descNorm ja vem de NormStr.
Private Function TemPalavra(descNorm As String, termo As String) As Boolean
    Dim s As String, i As Long, ch As String
    s = " "
    For i = 1 To Len(descNorm)
        ch = Mid$(descNorm, i, 1)
        If (ch >= "A" And ch <= "Z") Or (ch >= "0" And ch <= "9") Then
            s = s & ch
        Else
            s = s & " "
        End If
    Next i
    TemPalavra = (InStr(s & " ", " " & termo & " ") > 0)
End Function

' Fallback de classificacao por DESCRICAO quando o codigo SAP nao esta no mapa NT.006.
' Baseado na padronizacao de estruturas de distribuicao 15kV (NT.006 / NT.018 Equatorial
' e normas equivalentes ABNT/CELESC/ENEL). Preenche tm ByRef; retorna True se classificou.
' descNorm = descricao ja normalizada (UCase, sem acentos).
Private Function ClassificarDesc(descNorm As String, ByRef tm As tMaterial) As Boolean
    tm.Familia = "" : tm.CodNT006 = "~WEB" : tm.DescrNT006 = "Classif. por descricao (NT.006/018)"
    tm.EhAncora = False : tm.AncoraDep = "CRUZETA"
    tm.RazaoMin = 0 : tm.RazaoMax = 0 : tm.DescrRegra = ""
    ClassificarDesc = True

    ' ---- ANCORAS ----
    If InStr(descNorm, "CRUZETA") > 0 Then
        tm.Familia = "CRUZETA" : tm.EhAncora = True : tm.AncoraDep = "" : tm.CodNT006 = "R-02"
    ElseIf InStr(descNorm, "ISOLADOR") > 0 And (InStr(descNorm, "DISCO") > 0 Or InStr(descNorm, "SUSPENS") > 0) Then
        tm.Familia = "ISOL SUSPENSAO" : tm.EhAncora = True : tm.AncoraDep = "" : tm.CodNT006 = "I-06"
    ElseIf (InStr(descNorm, "HASTE") > 0 And (InStr(descNorm, "TERRA") > 0 Or InStr(descNorm, "ATERR") > 0 Or InStr(descNorm, "COBRE") > 0)) Then
        tm.Familia = "HASTE TERRA" : tm.EhAncora = True : tm.AncoraDep = "" : tm.CodNT006 = "F-17"
    ElseIf InStr(descNorm, "CHAVE") > 0 And InStr(descNorm, "FUS") > 0 Then
        tm.Familia = "CHAVE FUSIVEL" : tm.EhAncora = True : tm.AncoraDep = "" : tm.CodNT006 = "E-09"
    ElseIf InStr(descNorm, "CHAVE") > 0 Then
        tm.Familia = "CHAVE FACA/SECC" : tm.EhAncora = True : tm.AncoraDep = "" : tm.CodNT006 = "E-10"
        tm.DescrRegra = "Chave faca/seccionadora (ancora)"
    ElseIf InStr(descNorm, "TRAFO") > 0 Or InStr(descNorm, "TRANSFORMADOR") > 0 Then
        tm.Familia = "TRAFO" : tm.EhAncora = True : tm.AncoraDep = "" : tm.CodNT006 = "E-45"
    ElseIf InStr(descNorm, "GANCHO") > 0 And InStr(descNorm, "OLHAL") > 0 Then
        tm.Familia = "GANCHO OLHAL" : tm.EhAncora = True : tm.AncoraDep = "" : tm.CodNT006 = "F-13"
    ElseIf InStr(descNorm, "SUPORTE") > 0 And (InStr(descNorm, "PARA RAIO") > 0 Or InStr(descNorm, "PARARAIO") > 0) Then
        tm.Familia = "SUP PARA-RAIO" : tm.EhAncora = True : tm.AncoraDep = "" : tm.CodNT006 = "F-47"

    ' ---- DEPENDENTES DA CRUZETA (qtd por cruzeta) ----
    ElseIf InStr(descNorm, "ISOLADOR") > 0 And InStr(descNorm, "PILAR") > 0 Then
        tm.Familia = "ISOLADOR PILAR" : tm.AncoraDep = "CRUZETA" : tm.RazaoMin = 2 : tm.RazaoMax = 3.5
        tm.CodNT006 = "I-05" : tm.DescrRegra = "2-3 isolador pilar por cruzeta (1/fase, N1=3)"
    ElseIf InStr(descNorm, "MAO FRANCESA") > 0 Then
        tm.Familia = "MAO FRANCESA" : tm.AncoraDep = "CRUZETA" : tm.RazaoMin = 0.5 : tm.RazaoMax = 2.5
        tm.DescrRegra = "1-2 maos-francesas por cruzeta"
    ElseIf TemPalavra(descNorm, "SELA") Then
        tm.Familia = "SELA CRUZETA" : tm.AncoraDep = "CRUZETA" : tm.RazaoMin = 2 : tm.RazaoMax = 4
        tm.DescrRegra = "2-4 selas por cruzeta"
    ElseIf InStr(descNorm, "ARRUELA") > 0 Then
        tm.Familia = "ARRUELA" : tm.AncoraDep = "CRUZETA" : tm.RazaoMin = 2 : tm.RazaoMax = 9
        tm.CodNT006 = "A-02" : tm.DescrRegra = "2-8 arruelas por cruzeta (N1=4; N2=8)"
    ElseIf InStr(descNorm, "PORCA") > 0 Then
        tm.Familia = "PORCA" : tm.AncoraDep = "CRUZETA" : tm.RazaoMin = 2 : tm.RazaoMax = 6.5
        tm.CodNT006 = "A-21" : tm.DescrRegra = "2-6 porcas por cruzeta"
    ElseIf TemPalavra(descNorm, "PINO") Then
        tm.Familia = "PINO" : tm.AncoraDep = "CRUZETA" : tm.RazaoMin = 1 : tm.RazaoMax = 3.5
        tm.DescrRegra = "1-3 pinos por cruzeta (1 por isolador pilar)"
    ElseIf InStr(descNorm, "PARAFUSO") > 0 And InStr(descNorm, "OLHAL") > 0 Then
        tm.Familia = "PARAFUSO OLHAL" : tm.AncoraDep = "GANCHO OLHAL" : tm.RazaoMin = 0.8 : tm.RazaoMax = 1.2
        tm.CodNT006 = "F-34" : tm.DescrRegra = "1 parafuso olhal por ponto de suspensao"
    ElseIf InStr(descNorm, "PARAFUSO") > 0 Then
        tm.Familia = "PARAFUSO" : tm.AncoraDep = "CRUZETA" : tm.RazaoMin = 1 : tm.RazaoMax = 8
        tm.CodNT006 = "F-30" : tm.DescrRegra = "1-8 parafusos por cruzeta"

    ' ---- DEPENDENTES DE OUTRAS ANCORAS ----
    ElseIf InStr(descNorm, "PARA RAIO") > 0 Or InStr(descNorm, "PARARAIO") > 0 Then
        tm.Familia = "PARA-RAIO" : tm.AncoraDep = "SUP PARA-RAIO" : tm.RazaoMin = 0.8 : tm.RazaoMax = 1.2
        tm.CodNT006 = "E-29" : tm.DescrRegra = "1 para-raios por suporte (1:1)"
    ElseIf InStr(descNorm, "MANILHA") > 0 Then
        tm.Familia = "MANILHA" : tm.AncoraDep = "GANCHO OLHAL" : tm.RazaoMin = 0.8 : tm.RazaoMax = 1.2
        tm.CodNT006 = "F-22" : tm.DescrRegra = "1 manilha por ponto de suspensao"
    ElseIf InStr(descNorm, "OLHAL") > 0 Then
        tm.Familia = "OLHAL" : tm.AncoraDep = "GANCHO OLHAL" : tm.RazaoMin = 0.8 : tm.RazaoMax = 1.2
        tm.DescrRegra = "1 olhal por ponto de suspensao"
    ElseIf InStr(descNorm, "CONECTOR") > 0 And (InStr(descNorm, "HASTE") > 0 Or InStr(descNorm, "ATERR") > 0 Or InStr(descNorm, "CUNHA") > 0) Then
        tm.Familia = "CONEC HASTE" : tm.AncoraDep = "HASTE TERRA" : tm.RazaoMin = 0.8 : tm.RazaoMax = 1.2
        tm.CodNT006 = "M-10" : tm.DescrRegra = "1 conector por haste de aterramento"

    ' ---- ESTAI (cordoalha / esticador / sapata / haste ancora) ----
    ElseIf InStr(descNorm, "CORDOALHA") > 0 Or InStr(descNorm, "ESTICADOR") > 0 Or _
           InStr(descNorm, "SAPATA") > 0 Or (InStr(descNorm, "HASTE") > 0 And InStr(descNorm, "ANCORA") > 0) Then
        tm.Familia = "ESTAI" : tm.EhAncora = True : tm.AncoraDep = "" : tm.CodNT006 = "ES"
        tm.DescrRegra = "Conjunto de estai (ancoragem de poste)"

    ' ---- DPS / PROTETOR DE SURTO BT ----
    ElseIf TemPalavra(descNorm, "DPS") Or (InStr(descNorm, "PROTETOR") > 0 And InStr(descNorm, "SURTO") > 0) Then
        tm.Familia = "DPS" : tm.EhAncora = True : tm.AncoraDep = "" : tm.CodNT006 = "DPS"
        tm.DescrRegra = "Protetor de surto BT (neutro)"

    ' ---- CONDUTORES / CABOS / FIOS (medidos em metros - referencia por vao) ----
    ElseIf InStr(descNorm, "CABO") > 0 Or InStr(descNorm, "CONDUTOR") > 0 Or TemPalavra(descNorm, "FIO") Or TemPalavra(descNorm, "CAA") Or TemPalavra(descNorm, "CAZ") Then
        tm.Familia = "CABO/CONDUTOR" : tm.EhAncora = True : tm.AncoraDep = "" : tm.CodNT006 = "COND"
        tm.DescrRegra = "Condutor - medido em metros (referencia por vao)"

    ' ---- POSTE (ancora estrutural) ----
    ElseIf InStr(descNorm, "POSTE") > 0 Then
        tm.Familia = "POSTE" : tm.EhAncora = True : tm.AncoraDep = "" : tm.CodNT006 = "POSTE"
        tm.DescrRegra = "Poste - estrutura de suporte"

    ' ---- CAIXA DE MEDICAO: 1 por medidor ----
    ElseIf InStr(descNorm, "CAIXA") > 0 And (InStr(descNorm, "MEDI") > 0 Or _
           InStr(descNorm, "POLICARB") > 0 Or InStr(descNorm, "MONOF") > 0 Or InStr(descNorm, "POLIF") > 0) Then
        tm.Familia = "CAIXA MEDICAO" : tm.AncoraDep = "MEDIDOR" : tm.RazaoMin = 0.8 : tm.RazaoMax = 1.2
        tm.CodNT006 = "CX-M" : tm.DescrRegra = "1 caixa de medicao por medidor"
    ElseIf InStr(descNorm, "CAIXA") > 0 Then
        tm.Familia = "CAIXA" : tm.EhAncora = True : tm.AncoraDep = "" : tm.CodNT006 = "CX"
        tm.DescrRegra = "Caixa (neutro)"

    ' ---- MEDIDOR (ancora p/ lacre e caixa) ----
    ElseIf InStr(descNorm, "MEDIDOR") > 0 Then
        tm.Familia = "MEDIDOR" : tm.EhAncora = True : tm.AncoraDep = "" : tm.CodNT006 = "MED"
        tm.DescrRegra = "Medidor de energia"

    ' ---- LACRE: 2 por medidor instalado (ODM) ----
    ElseIf InStr(descNorm, "LACRE") > 0 Then
        tm.Familia = "LACRE" : tm.AncoraDep = "MEDIDOR" : tm.RazaoMin = 1.8 : tm.RazaoMax = 2.2
        tm.CodNT006 = "LACRE" : tm.DescrRegra = "2 lacres por medidor instalado"

    ' ---- ELO / FUSIVEL: depende da chave fusivel (1/fase) ----
    ElseIf TemPalavra(descNorm, "ELO") Or (InStr(descNorm, "FUSIVEL") > 0 And InStr(descNorm, "CHAVE") = 0) Then
        tm.Familia = "ELO FUSIVEL" : tm.AncoraDep = "CHAVE FUSIVEL" : tm.RazaoMin = 0.8 : tm.RazaoMax = 3.5
        tm.CodNT006 = "E-12" : tm.DescrRegra = "1-3 elos por chave fusivel (1/fase)"

    ' ---- CINTA: depende do poste ----
    ElseIf TemPalavra(descNorm, "CINTA") Then
        tm.Familia = "CINTA POSTE" : tm.AncoraDep = "POSTE" : tm.RazaoMin = 1 : tm.RazaoMax = 4
        tm.DescrRegra = "1-4 cintas por poste"

    ' ---- ARMACAO SECUNDARIA (ancora BT) ----
    ElseIf InStr(descNorm, "ARMACAO") > 0 Then
        tm.Familia = "ARMACAO SEC" : tm.EhAncora = True : tm.AncoraDep = "" : tm.CodNT006 = "F-01"
        tm.DescrRegra = "Armacao secundaria BT (ancora)"

    ' ---- ROLDANA: depende da armacao ----
    ElseIf InStr(descNorm, "ROLDANA") > 0 Then
        tm.Familia = "ROLDANA" : tm.AncoraDep = "ARMACAO SEC" : tm.RazaoMin = 0.8 : tm.RazaoMax = 1.2
        tm.DescrRegra = "1 roldana por armacao"

    ' ---- GRAMPO (linha morta / ancoragem / suspensao - neutro) ----
    ElseIf InStr(descNorm, "GRAMPO") > 0 Then
        tm.Familia = "GRAMPO" : tm.EhAncora = True : tm.AncoraDep = "" : tm.CodNT006 = "F-20"
        tm.DescrRegra = "Grampo de ancoragem/suspensao"

    ' ---- CONECTOR (perfurante / cunha / derivacao - neutro) ----
    ElseIf InStr(descNorm, "CONECTOR") > 0 Or InStr(descNorm, "CONEX") > 0 Then
        tm.Familia = "CONECTOR" : tm.EhAncora = True : tm.AncoraDep = "" : tm.CodNT006 = "M-01"
        tm.DescrRegra = "Conector eletrico (neutro)"

    ' ---- LUVA DE EMENDA (neutro) ----
    ElseIf TemPalavra(descNorm, "LUVA") Then
        tm.Familia = "LUVA EMENDA" : tm.EhAncora = True : tm.AncoraDep = "" : tm.CodNT006 = "M-05"
        tm.DescrRegra = "Luva de emenda de condutor"

    ' ---- FITA / FECHO / FIVELA (rede compacta - neutro) ----
    ElseIf TemPalavra(descNorm, "FITA") Or InStr(descNorm, "FECHO") > 0 Or InStr(descNorm, "FIVELA") > 0 Then
        tm.Familia = "FITA/FECHO" : tm.EhAncora = True : tm.AncoraDep = "" : tm.CodNT006 = "F-50"
        tm.DescrRegra = "Fita/fecho de aco inox (fixacao)"

    ' ---- TERMINAL / CABECOTE / MUFLA (neutro) ----
    ElseIf InStr(descNorm, "TERMINAL") > 0 Or InStr(descNorm, "CABECOTE") > 0 Or InStr(descNorm, "MUFLA") > 0 Then
        tm.Familia = "TERMINAL/MUFLA" : tm.EhAncora = True : tm.AncoraDep = "" : tm.CodNT006 = "M-30"
        tm.DescrRegra = "Terminacao de cabo (neutro)"

    ' ---- ESTRIBO (conexao de derivacao - neutro) ----
    ElseIf InStr(descNorm, "ESTRIBO") > 0 Then
        tm.Familia = "ESTRIBO" : tm.EhAncora = True : tm.AncoraDep = "" : tm.CodNT006 = "M-40"
        tm.DescrRegra = "Estribo (conexao de derivacao)"

    ' ---- EQUIPAMENTO DE MANOBRA/PROTECAO (religador/seccionador/disjuntor/regulador - ancora) ----
    ElseIf InStr(descNorm, "RELIGADOR") > 0 Or InStr(descNorm, "SECCIONA") > 0 Or InStr(descNorm, "DISJUNTOR") > 0 Or InStr(descNorm, "REGULADOR") > 0 Then
        tm.Familia = "EQUIP MANOBRA" : tm.EhAncora = True : tm.AncoraDep = "" : tm.CodNT006 = "EQ"
        tm.DescrRegra = "Equipamento de manobra/protecao (ancora)"

    ' ---- BUCHA / fixacao generica por cruzeta ----
    ElseIf TemPalavra(descNorm, "BUCHA") Then
        tm.Familia = "BUCHA" : tm.AncoraDep = "CRUZETA" : tm.RazaoMin = 1 : tm.RazaoMax = 8
        tm.DescrRegra = "Bucha/fixacao por cruzeta"

    ' ---- REDE COMPACTA (NT.018) - referencia por vao; tratado como neutro ----
    ElseIf InStr(descNorm, "ESPACADOR") > 0 Or InStr(descNorm, "BRACO") > 0 Or InStr(descNorm, "LOSANGULAR") > 0 Then
        tm.Familia = "REDE COMPACTA" : tm.EhAncora = True : tm.AncoraDep = "" : tm.CodNT006 = "NT018"
        tm.DescrRegra = "Rede compacta - referencia por vao (3-5 espacadores/vao)"
    ElseIf InStr(descNorm, "ALCA") > 0 And InStr(descNorm, "PREFORM") > 0 Then
        tm.Familia = "ALCA PREFORMADA" : tm.EhAncora = True : tm.AncoraDep = "" : tm.CodNT006 = "F-04"
        tm.DescrRegra = "Alca preformada (amarracao de condutor)"
    ElseIf TemPalavra(descNorm, "ANEL") Or TemPalavra(descNorm, "LACO") Or TemPalavra(descNorm, "ALCA") Then
        tm.Familia = "REDE COMPACTA" : tm.EhAncora = True : tm.AncoraDep = "" : tm.CodNT006 = "NT018"
        tm.DescrRegra = "Acessorio rede compacta (anel/laco/alca)"

    ' ---- ELETRODUTO / FERRAGENS / ARAME / SUPORTE (identificacao, neutros) ----
    ElseIf InStr(descNorm, "ELETRODUTO") > 0 Then
        tm.Familia = "ELETRODUTO" : tm.EhAncora = True : tm.AncoraDep = "" : tm.CodNT006 = "ED"
        tm.DescrRegra = "Eletroduto/duto de descida"
    ElseIf InStr(descNorm, "ABRACADEIRA") > 0 Or InStr(descNorm, "CANTONEIRA") > 0 Or _
           InStr(descNorm, "PERFIL") > 0 Or InStr(descNorm, "CHAPA") > 0 Then
        tm.Familia = "FERRAGEM" : tm.EhAncora = True : tm.AncoraDep = "" : tm.CodNT006 = "FE"
        tm.DescrRegra = "Ferragem de fixacao (neutro)"
    ElseIf TemPalavra(descNorm, "ARAME") Then
        tm.Familia = "ARAME" : tm.EhAncora = True : tm.AncoraDep = "" : tm.CodNT006 = "AR"
        tm.DescrRegra = "Arame de amarracao"
    ElseIf InStr(descNorm, "SUPORTE") > 0 Then
        tm.Familia = "SUPORTE" : tm.EhAncora = True : tm.AncoraDep = "" : tm.CodNT006 = "SUP"
        tm.DescrRegra = "Suporte generico (neutro)"

    Else
        ClassificarDesc = False
    End If
End Function

' Formata a diferenca SAP-PRJ com sinal e percentual (p/ o MOTIVO de reprovados)
' Ex: " | Dif=+3 (42,9% acima)"  /  " | Dif=-2 (-25,0% abaixo)"
Private Function FmtDif(libV As Variant, prjV As Variant) As String
    If IsNumeric(libV) And IsNumeric(prjV) Then
        Dim l As Double, p As Double, d As Double
        l = CDbl(libV) : p = CDbl(prjV) : d = l - p
        Dim s As String
        s = " | Dif=" & IIf(d >= 0, "+", "") & Format(d, "#,##0.##")
        If p <> 0 Then
            s = s & " (" & Format(Abs(d / p), "0.0%") & IIf(d >= 0, " acima", " abaixo") & ")"
        End If
        FmtDif = s
    Else
        FmtDif = ""
    End If
End Function

' Aderencia com margem de 10pct p/ condutores, cabos e ramal (kg ou m)
Private Function EhAderente(fam As String, libV As Variant, prjV As Variant, rawSitNorm As String) As Boolean
    Dim isMarg As Boolean
    isMarg = (Left(fam, 4) = "COND" Or Left(fam, 4) = "CABO" Or fam = "RAMAL")
    If isMarg And IsNumeric(libV) And IsNumeric(prjV) Then
        Dim l As Double, pp As Double
        l = CDbl(libV) : pp = CDbl(prjV)
        If pp = 0 Then
            EhAderente = (l = 0)
        Else
            Dim tol As Double : tol = mTolAder : If tol <= 0 Then tol = 0.1
            EhAderente = (Abs(l - pp) <= tol*Abs(pp))
        End If
    Else
        EhAderente = (rawSitNorm = "ADERENTE")
    End If
End Function

Private Function FmtKPI(v As Double) As String
    Dim a As Double : a = Abs(v)
    If a >= 1000000 Then
        FmtKPI = "R$ " & Format(v*0.000001, "0.0") & " MM"
    ElseIf a >= 1000 Then
        FmtKPI = "R$ " & Format(v*0.001, "#,##0") & " mil"
    Else
        FmtKPI = "R$ " & Format(v, "#,##0")
    End If
End Function

' True quando a unidade do material e CONTAVEL (UN, PC, CJ...) e a faixa
' prevista deve ser exibida/avaliada em numeros INTEIROS. Unidades continuas
' (metro, quilo, litro...) mantem decimais.
Private Function EhUnidadeInteira(uml As String) As Boolean
    Dim u As String : u = NormStr(uml)
    Select Case u
        Case "M", "MT", "MTS", "KM", "KG", "G", "GR", "T", "TON", "L", "LT", "M2", "M3"
            EhUnidadeInteira = False
        Case Else
            EhUnidadeInteira = True   ' UN, PC, CJ, JG, vazio etc.
    End Select
End Function

Private Sub ProcessarCOMInventario(wsBase As Worksheet, wsCom As Worksheet)

    Dim lastC As Long
    lastC = wsBase.Cells(1, wsBase.Columns.Count).End(xlToLeft).Column

    Dim colPEP3 As Long, colPEP4 As Long, colMat As Long
    Dim colDescM As Long, colQtd As Long, colUML As Long
    Dim colTipo As Long, colPEP3n As Long
    Dim c As Long, h As String
    For c = 1 To lastC
        h = NormStr(CStr(wsBase.Cells(1, c).Value))
        Select Case h
            Case "PEP3NIVEL":   colPEP3 = c
            Case "PEP4NIVEL":   colPEP4 = c
            Case "COD MAT":     colMat  = c
            Case "DESC MAT":    colDescM = c
            Case "MAT LIB SAP": colQtd  = c
            Case "UND":         colUML  = c
            Case "TIPO":        colTipo = c
        End Select
    Next c
    If colPEP4 = 0 Then colPEP4 = 2
    If colMat  = 0 Then colMat  = 5
    If colDescM= 0 Then colDescM= 7
    If colQtd  = 0 Then colQtd  = 9
    If colUML  = 0 Then colUML  = 8
    If colTipo = 0 Then colTipo = 11
    If colPEP3 = 0 Then colPEP3 = 1

    Dim nt006 As Object
    Set nt006 = CriarMapaNT006()

    Dim liquidQ    As Object : Set liquidQ    = CreateObject("Scripting.Dictionary")
    Dim liquidInfo As Object : Set liquidInfo = CreateObject("Scripting.Dictionary")

    Dim lastRow As Long
    lastRow = wsBase.Cells(wsBase.Rows.Count, colPEP4).End(xlUp).Row

    Dim d As Variant
    d = wsBase.Range(wsBase.Cells(2, 1), wsBase.Cells(lastRow, lastC)).Value
    Dim nRows As Long : nRows = lastRow - 1

    Dim r As Long
    For r = 1 To nRows
        Dim tipoR As String : tipoR = NormStr(CStr(d(r, colTipo)))
        If tipoR = "COM" Then
            Dim pep4   As String : pep4   = Trim(CStr(d(r, colPEP4)))
            Dim pep3   As String : pep3   = Trim(CStr(d(r, colPEP3)))
            Dim matCod As String : matCod = NormCod(d(r, colMat))
            Dim qtd    As Double : qtd    = ToNum(d(r, colQtd))
            Dim key    As String : key    = pep4 & "|" & matCod
            If liquidQ.Exists(key) Then
                liquidQ(key) = liquidQ(key) + qtd
            Else
                liquidQ.Add key, qtd
                Dim info(5) As String
                info(0) = pep4
                info(1) = pep3
                info(2) = matCod
                info(3) = Trim(CStr(d(r, colDescM)))
                info(4) = Trim(CStr(d(r, colUML)))
                info(5) = pep3
                liquidInfo.Add key, info
            End If
        End If
    Next r

    Dim ancoras As Object : Set ancoras = CreateObject("Scripting.Dictionary")
    Dim ancorasP3 As Object : Set ancorasP3 = CreateObject("Scripting.Dictionary")  ' pep3|familia (fallback)
    Dim ancoraInfo As Object : Set ancoraInfo = CreateObject("Scripting.Dictionary")  ' pep|familia -> "cod - desc"
    Dim k As Variant
    For Each k In liquidQ.Keys
        Dim matCodK As String : matCodK = Split(CStr(k), "|")(1)
        Dim pepK    As String : pepK    = Split(CStr(k), "|")(0)
        Dim tm As tMaterial
        Dim achouTm As Boolean : achouTm = False
        If nt006.Exists(matCodK) Then
            tm = GetMat(nt006, matCodK) : achouTm = True
        Else
            ' Fallback por descricao (web NT.006/018)
            Dim descK As String : descK = NormStr(CStr(liquidInfo(k)(3)))
            achouTm = ClassificarDesc(descK, tm)
        End If
        If achouTm Then
            If tm.EhAncora Then
                Dim aKey As String : aKey = pepK & "|" & tm.Familia
                If ancoras.Exists(aKey) Then
                    ancoras(aKey) = ancoras(aKey) + liquidQ(k)
                Else
                    ancoras.Add aKey, liquidQ(k)
                    ' guarda o material ancora representativo (cod - desc)
                    ancoraInfo.Add aKey, liquidInfo(k)(2) & " - " & liquidInfo(k)(3)
                End If
                ' agregado no PEP3 (fallback p/ PEP4 irmaos que dividem materiais)
                Dim aKey3 As String : aKey3 = liquidInfo(k)(1) & "|" & tm.Familia
                If ancorasP3.Exists(aKey3) Then
                    ancorasP3(aKey3) = ancorasP3(aKey3) + liquidQ(k)
                Else
                    ancorasP3.Add aKey3, liquidQ(k)
                End If
            End If
        End If
    Next k

    CabecalhoRacioNT wsCom

    Dim keys() As String
    Dim ki As Long : ki = 0
    If liquidQ.Count > 0 Then
    ReDim keys(0 To liquidQ.Count - 1)
    For Each k In liquidQ.Keys
        keys(ki) = CStr(k) : ki = ki + 1
    Next k
    QuickSortStr keys, 0, UBound(keys)

    ' Saida bufferizada: monta as linhas em array e escreve na planilha UMA vez
    Dim outA() As Variant : ReDim outA(1 To liquidQ.Count, 1 To 10)
    Dim stArr() As String : ReDim stArr(1 To liquidQ.Count)
    Dim i As Long

    For i = 0 To UBound(keys)
        k = keys(i)
        Dim pepV  As String : pepV = Split(CStr(k), "|")(0)
        Dim matV  As String : matV = Split(CStr(k), "|")(1)
        Dim qtdL  As Double : qtdL = liquidQ(k)
        Dim inf() As String : inf  = liquidInfo(k)

        Dim familia   As String  : familia   = "SEM REFERENCIA"
        Dim codNT     As String  : codNT     = "-"
        Dim descrNT   As String  : descrNT   = ""
        Dim ancoraFam As String  : ancoraFam = ""
        Dim qtdAnc    As Double  : qtdAnc    = 0
        Dim faixaMin  As Double  : faixaMin  = 0
        Dim faixaMax  As Double  : faixaMax  = 0
        Dim regra     As String  : regra     = ""
        Dim status    As String  : status    = "SEM REFERENCIA"
        Dim ehAnc     As Boolean : ehAnc     = False
        Dim ancNivel3 As Boolean : ancNivel3 = False

        ' Tenta mapa por codigo SAP; se nao houver, fallback por descricao (web NT.006/018)
        Dim tmV As tMaterial
        Dim temRef As Boolean : temRef = False
        If nt006.Exists(matV) Then
            tmV = GetMat(nt006, matV) : temRef = True
        Else
            Dim descV As String : descV = NormStr(CStr(inf(3)))
            temRef = ClassificarDesc(descV, tmV)
        End If

        If temRef Then
            familia   = tmV.Familia
            codNT     = tmV.CodNT006
            descrNT   = tmV.DescrNT006
            ehAnc     = tmV.EhAncora
            regra     = tmV.DescrRegra
            ancoraFam = tmV.AncoraDep
            If ehAnc Then
                If qtdL < 0 Then
                    status = "ESTORNO SEM ENTRADA"
                ElseIf qtdL = 0 Then
                    status = "QTD ZERO"
                Else
                    status = "ANCORA"
                End If
            Else
                Dim ancKey As String : ancKey = pepV & "|" & ancoraFam
                If ancoras.Exists(ancKey) Then qtdAnc = ancoras(ancKey)
                ' FALLBACK: ancora ausente/zerada no PEP4 -> usa o agregado do
                ' PEP3 (estruturas costumam dividir materiais entre PEP4 irmaos)
                If qtdAnc <= 0 Then
                    Dim ancKey3 As String : ancKey3 = inf(1) & "|" & ancoraFam
                    If ancorasP3.Exists(ancKey3) Then
                        If ancorasP3(ancKey3) > 0 Then
                            qtdAnc = ancorasP3(ancKey3) : ancNivel3 = True
                        End If
                    End If
                End If
                If qtdAnc > 0 Then
                    ' FOLGA UNICA: ja embutida nas razoes min/max do mapa NT.006.
                    ' (removido o multiplicador extra 0.9/1.1, que somava
                    '  tolerancia sobre tolerancia e afrouxava a regra)
                    faixaMin = qtdAnc * tmV.RazaoMin
                    faixaMax = qtdAnc * tmV.RazaoMax
                    ' Material contavel (UN/PC/CJ...): faixa em INTEIROS
                    ' (min arredonda p/ baixo, max p/ cima - nao gera falso alerta)
                    If EhUnidadeInteira(inf(4)) Then
                        faixaMin = Int(faixaMin)
                        faixaMax = -Int(-faixaMax)
                    End If
                    If qtdL < 0 Then
                        status = "ESTORNO SEM ENTRADA"
                    ElseIf qtdL < faixaMin Then
                        status = "INSUFICIENTE"
                    ElseIf faixaMax > 0 And qtdL >= faixaMax * 2# Then
                        status = "EXCESSO EXAGERADO"
                    ElseIf qtdL > faixaMax Then
                        status = "EXCESSO"
                    Else
                        status = "OK"
                    End If
                Else
                    status = "SEM ANCORA"
                End If
            End If
        End If

        ' Texto do previsto (faixa) p/ leitura humana
        Dim previstoTxt As String
        If faixaMax > 0 Then
            previstoTxt = Format(faixaMin, "#,##0.##") & " a " & Format(faixaMax, "#,##0.##")
        Else
            previstoTxt = "-"
        End If

        ' Observacao em linguagem clara: quanto veio x o previsto
        Dim obsTxt As String
        Dim qVeio As String : qVeio = Format(qtdL, "#,##0.##")
        Select Case status
            Case "ANCORA"
                obsTxt = "Material de referencia (ancora)"
            Case "OK"
                obsTxt = "Dentro do previsto"
            Case "INSUFICIENTE"
                obsTxt = "Veio MENOS que o previsto (faltaram " & Format(faixaMin - qtdL, "#,##0.##") & ")"
            Case "EXCESSO"
                obsTxt = "Veio MAIS que o previsto (excedeu " & Format(qtdL - faixaMax, "#,##0.##") & ")"
            Case "EXCESSO EXAGERADO"
                obsTxt = "Veio MUITO acima do previsto (" & Format(qtdL / faixaMax, "0.0") & "x o maximo)"
            Case "SEM ANCORA"
                obsTxt = "Sem " & ancoraFam & " no PEP para comparar"
            Case "QTD ZERO"
                obsTxt = "Quantidade zero na obra"
            Case "ESTORNO SEM ENTRADA"
                obsTxt = "Estorno sem entrada correspondente"
            Case "SEM REFERENCIA"
                obsTxt = "Material fora da NT.006"
            Case Else
                obsTxt = ""
        End Select
        If ancNivel3 Then obsTxt = obsTxt & " [ancora agregada no PEP3]"
        If temRef Then
            If tmV.CodNT006 = "~WEB" Then obsTxt = obsTxt & " [classif. por descricao]"
        End If

        ' LIGADO A: a qual material/ancora este COM deveria corresponder
        Dim ligadoTxt As String : ligadoTxt = "-"
        If temRef Then
            If ehAnc Then
                ligadoTxt = "(e a propria referencia)"
            ElseIf ancoraFam <> "" Then
                Dim aK As String : aK = pepV & "|" & ancoraFam
                If ancoras.Exists(aK) Then
                    Dim aInfo As String : aInfo = ancoraFam
                    If ancoraInfo.Exists(aK) Then aInfo = ancoraInfo(aK)
                    ligadoTxt = aInfo & " (" & ancoraFam & ", qtd " & Format(ancoras(aK), "#,##0.##") & ")"
                ElseIf ancNivel3 Then
                    ligadoTxt = ancoraFam & " (agregada no PEP3, qtd " & Format(qtdAnc, "#,##0.##") & ")"
                Else
                    ligadoTxt = ancoraFam & " (AUSENTE no PEP)"
                End If
            End If
        End If

        Dim bgS As Long, fgS As Long, icoS As String
        CoresStatusRacio status, bgS, fgS, icoS
        outA(i + 1, 1) = pepV : outA(i + 1, 2) = inf(1) : outA(i + 1, 3) = matV
        outA(i + 1, 4) = inf(3) : outA(i + 1, 5) = familia : outA(i + 1, 6) = ligadoTxt
        outA(i + 1, 7) = qtdL : outA(i + 1, 8) = previstoTxt : outA(i + 1, 9) = icoS
        outA(i + 1, 10) = obsTxt
        stArr(i + 1) = status
    Next i

    wsCom.Range(wsCom.Cells(3, 1), wsCom.Cells(2 + liquidQ.Count, 10)).Value = outA
    FormatarLinhasRacioNT wsCom, stArr, liquidQ.Count
    End If   ' liquidQ.Count > 0

    FormatarColunasRacioNT wsCom

    On Error Resume Next
    wsCom.Activate
    wsCom.Range("A3").Select
    ActiveWindow.FreezePanes = True
    wsCom.Range("A2:J2").AutoFilter
    wsCom.Range("A1").Select
    On Error GoTo 0

End Sub

Private Sub CabecalhoRacioNT(ws As Worksheet)
    With ws.Range("A1:J1")
        .Merge
        .Value = "RACIONALIZACAO COM  -  o que veio na obra x o previsto (NT.006)"
        .Font.Name = "Segoe UI Semibold" : .Font.Bold = True : .Font.Size = 13
        .Font.Color = RGB(235, 240, 248)
        .Interior.Color = RGB(17, 24, 39)
        .HorizontalAlignment = xlCenter : .VerticalAlignment = xlCenter
    End With
    ws.Rows(1).RowHeight = 30
    Dim hdrs As Variant
    hdrs = Array("PEP4NIVEL", "PEP3NIVEL", "COD MATERIAL", "MATERIAL", "FAMILIA", _
                 "LIGADO A (referencia)", "VEIO", "PREVISTO", "STATUS", "OBSERVACAO")
    Dim c As Long
    For c = 1 To 10
        With ws.Cells(2, c)
            .Value = hdrs(c - 1)
            .Font.Name = "Segoe UI Semibold" : .Font.Bold = True : .Font.Size = 10
            .Font.Color = RGB(235, 240, 248)
            .Interior.Color = RGB(31, 41, 59)
            .HorizontalAlignment = xlCenter : .VerticalAlignment = xlCenter
            .Borders.LineStyle = xlContinuous : .Borders.Color = RGB(60, 70, 90)
        End With
    Next c
    ws.Rows(2).RowHeight = 22
End Sub

' Tabela de cores semanticas por STATUS da racionalizacao (fundo, texto e rotulo)
Private Sub CoresStatusRacio(st As String, ByRef bgS As Long, ByRef fgS As Long, ByRef ico As String)
    Select Case st
        Case "OK":                bgS = RGB(198, 239, 206) : fgS = RGB(0, 97, 0)   : ico = "OK"
        Case "ANCORA":            bgS = RGB(221, 235, 247) : fgS = RGB(31, 78, 121): ico = "REFERENCIA"
        Case "EXCESSO":           bgS = RGB(255, 235, 156) : fgS = RGB(156, 87, 0) : ico = "EXCESSO"
        Case "EXCESSO EXAGERADO": bgS = RGB(192, 0, 0)     : fgS = RGB(255, 255, 255): ico = "EXAGERADO"
        Case "INSUFICIENTE":      bgS = RGB(255, 199, 206) : fgS = RGB(156, 0, 6)  : ico = "FALTANDO"
        Case "SEM ANCORA":        bgS = RGB(255, 242, 204) : fgS = RGB(119, 107, 0): ico = "SEM ANCORA"
        Case "QTD ZERO":          bgS = RGB(230, 230, 230) : fgS = RGB(64, 64, 64) : ico = "ZERO"
        Case "ESTORNO SEM ENTRADA": bgS = RGB(230, 230, 230): fgS = RGB(64, 64, 64): ico = "ESTORNO"
        Case Else:                bgS = RGB(242, 242, 242) : fgS = RGB(89, 89, 89) : ico = st
    End Select
End Sub

' Formata as linhas de dados da racionalizacao em LOTE: base (fonte/borda/
' alinhamento) numa chamada so, zebra via formatacao condicional e cores
' semanticas aplicadas por BLOCOS de linhas consecutivas com o mesmo status.
Private Sub FormatarLinhasRacioNT(ws As Worksheet, stArr() As String, nRows As Long)
    If nRows < 1 Then Exit Sub
    Dim r1 As Long : r1 = 3
    Dim r2 As Long : r2 = r1 + nRows - 1

    With ws.Range(ws.Cells(r1, 1), ws.Cells(r2, 10))
        .Font.Name = "Segoe UI" : .Font.Size = 9
        .Interior.Color = RGB(255, 255, 255)
        .Borders.LineStyle = xlContinuous : .Borders.Color = RGB(225, 225, 225)
        .VerticalAlignment = xlCenter
        .HorizontalAlignment = xlLeft
    End With
    ws.Range(ws.Cells(r1, 1), ws.Cells(r2, 3)).HorizontalAlignment = xlCenter
    ws.Range(ws.Cells(r1, 7), ws.Cells(r2, 8)).HorizontalAlignment = xlCenter
    ws.Range(ws.Cells(r1, 7), ws.Cells(r2, 7)).NumberFormat = "#,##0.##"
    ws.Rows(r1 & ":" & r2).RowHeight = 16

    ' zebra nas colunas descritivas (mesma tecnica MOD(ROW(),2) da ANALISE SAP x PRJ)
    On Error Resume Next
    Dim zb As Range : Set zb = ws.Range(ws.Cells(r1, 1), ws.Cells(r2, 8))
    zb.FormatConditions.Delete
    With zb.FormatConditions.Add(xlExpression, , "MOD(ROW(),2)=0")
        .Interior.Color = RGB(244, 247, 250)
    End With
    On Error GoTo 0

    Dim i As Long, iIni As Long, st As String
    Dim bgS As Long, fgS As Long, ico As String
    i = 1
    Do While i <= nRows
        st = stArr(i) : iIni = i
        Do While i < nRows
            If stArr(i + 1) <> st Then Exit Do
            i = i + 1
        Loop
        CoresStatusRacio st, bgS, fgS, ico
        With ws.Range(ws.Cells(r1 + iIni - 1, 9), ws.Cells(r1 + i - 1, 9))
            .Interior.Color = bgS : .Font.Color = fgS : .Font.Bold = True
            .HorizontalAlignment = xlCenter
        End With
        With ws.Range(ws.Cells(r1 + iIni - 1, 10), ws.Cells(r1 + i - 1, 10))
            .Interior.Color = bgS : .Font.Color = fgS
            .Font.Bold = (st = "EXCESSO EXAGERADO" Or st = "INSUFICIENTE" Or st = "EXCESSO")
        End With
        i = i + 1
    Loop
End Sub

' Ordena um vetor de strings in-place (quicksort; substitui o bubble sort O(n^2))
Private Sub QuickSortStr(a() As String, ByVal lo As Long, ByVal hi As Long)
    If lo >= hi Then Exit Sub
    Dim i As Long, j As Long, pv As String, tmp As String
    i = lo : j = hi : pv = a((lo + hi) \ 2)
    Do While i <= j
        Do While a(i) < pv : i = i + 1 : Loop
        Do While a(j) > pv : j = j - 1 : Loop
        If i <= j Then
            tmp = a(i) : a(i) = a(j) : a(j) = tmp
            i = i + 1 : j = j - 1
        End If
    Loop
    QuickSortStr a, lo, j
    QuickSortStr a, i, hi
End Sub

Private Sub FormatarColunasRacioNT(ws As Worksheet)
    Dim wds As Variant
    wds = Array(26, 24, 14, 42, 18, 40, 9, 12, 16, 46)
    Dim c As Long
    For c = 1 To 10
        ws.Columns(c).ColumnWidth = wds(c - 1)
    Next c
End Sub

Private Sub ProcessarAlertaCritico(wsBase As Worksheet, ws As Worksheet)

    Dim precos As Object
    Set precos = CarregarPrecos(wsBase.Parent)

    Dim lastC As Long
    lastC = wsBase.Cells(1, wsBase.Columns.Count).End(xlToLeft).Column
    Dim idxPep3 As Long, idxPep4 As Long, idxCod As Long, idxDesc As Long
    Dim idxFam As Long, idxTipo As Long, idxValor As Long, idxQtd As Long, idxTipoPep As Long
    Dim c As Long, hb As String
    For c = 1 To lastC
        hb = NormStr(CStr(wsBase.Cells(1, c).Value))
        Select Case hb
            Case "PEP3NIVEL":   idxPep3 = c
            Case "PEP4NIVEL":   idxPep4 = c
            Case "COD MAT":     idxCod  = c
            Case "DESC MAT":    idxDesc = c
            Case "FAMILIA":     idxFam  = c
            Case "TIPO":        idxTipo = c
            Case "VALOR":       idxValor = c
            Case "MAT LIB SAP": idxQtd  = c
            Case "TIPO PEP":    idxTipoPep = c
        End Select
    Next c

    Dim hdrs As Variant
    hdrs = Array("TIPO ALERTA","PEP3NIVEL","PEP4NIVEL","COD MAT","DESC MAT","FAMILIA","VALOR","QTD","PRECO UNIT","REFERENCIA","MOTIVO")
    For c = 1 To 11
        With ws.Cells(1, c)
            .Value = hdrs(c - 1)
            .Font.Name = "Segoe UI Semibold" : .Font.Bold = True : .Font.Size = 10
            .Font.Color = RGB(235, 240, 248)
            .Interior.Color = RGB(17, 24, 39)        ' navy escuro
            .HorizontalAlignment = xlCenter : .VerticalAlignment = xlCenter
            .Borders.LineStyle = xlContinuous : .Borders.Color = RGB(60, 70, 90)
        End With
    Next c
    ws.Rows(1).RowHeight = 30

    Dim refCol As Long : refCol = idxPep4 : If refCol = 0 Then refCol = 1
    Dim lastRow As Long
    lastRow = wsBase.Cells(wsBase.Rows.Count, refCol).End(xlUp).Row
    If lastRow < 2 Then GoTo Finaliza2

    Dim d As Variant
    d = wsBase.Range(wsBase.Cells(2, 1), wsBase.Cells(lastRow, lastC)).Value
    Dim n As Long : n = lastRow - 1

    Dim p4pep3b  As Object : Set p4pep3b = CreateObject("Scripting.Dictionary")
    Dim p4uc     As Object : Set p4uc    = CreateObject("Scripting.Dictionary")
    Dim p4odi    As Object : Set p4odi   = CreateObject("Scripting.Dictionary")
    Dim p4com    As Object : Set p4com   = CreateObject("Scripting.Dictionary")  ' pep4 -> tem COM?
    Dim ucNzP4   As Object : Set ucNzP4  = CreateObject("Scripting.Dictionary")  ' pep4 -> tem UC com MAT LIB SAP <> 0?
    ' ODM: medidor x lacre (1 medidor -> 2 lacres)
    Dim medP4   As Object : Set medP4   = CreateObject("Scripting.Dictionary")  ' pep4 -> qtd medidores
    Dim lacreP4 As Object : Set lacreP4 = CreateObject("Scripting.Dictionary")  ' pep4 -> qtd lacres
    Dim medPep3 As Object : Set medPep3 = CreateObject("Scripting.Dictionary")  ' pep4 -> pep3
    Dim pep3All As Object : Set pep3All = CreateObject("Scripting.Dictionary")  ' pep3 -> pep4 representativo
    Dim pep3UCb As Object : Set pep3UCb = CreateObject("Scripting.Dictionary")  ' pep3 -> tem UC?
    Dim i As Long, pep3 As String, pep4 As String, tipo As String, tipoPep As String
    For i = 1 To n
        pep3 = "" : pep4 = "" : tipo = "" : tipoPep = ""
        If idxPep3 > 0 Then pep3 = Trim(CStr(d(i, idxPep3)))
        If idxPep4 > 0 Then pep4 = Trim(CStr(d(i, idxPep4)))
        If idxTipo > 0 Then tipo = NormStr(CStr(d(i, idxTipo)))
        If idxTipoPep > 0 Then tipoPep = NormStr(CStr(d(i, idxTipoPep)))
        If pep4 <> "" Then
            If Not p4pep3b.Exists(pep4) Then p4pep3b.Add pep4, pep3
            If Not p4odi.Exists(pep4) Then p4odi.Add pep4, False
            If tipoPep = "I" Or Right(pep4, 2) = ".I" Then p4odi(pep4) = True
            If tipo = "UC" And Not p4uc.Exists(pep4) Then p4uc.Add pep4, True
            ' UC com quantidade efetiva (MAT LIB SAP <> 0)
            If tipo = "UC" And idxQtd > 0 Then
                If Val0(d(i, idxQtd)) <> 0 And Not ucNzP4.Exists(pep4) Then ucNzP4.Add pep4, True
            End If
            If tipo = "COM" And Not p4com.Exists(pep4) Then p4com.Add pep4, True
        End If
        ' agrega por PEP3: existe e se tem alguma UC
        If pep3 <> "" Then
            If Not pep3All.Exists(pep3) Then pep3All.Add pep3, pep4
            If tipo = "UC" And Not pep3UCb.Exists(pep3) Then pep3UCb.Add pep3, True
        End If
    Next i

    Dim outRow As Long : outRow = 2
    Dim codMat As String, descMat As String, familia As String, famN As String
    Dim valor As Double, qtd As Double, unit As Double, refP As Double

    Dim kk As Variant
    For Each kk In p4pep3b.Keys
        If p4odi(kk) And Not ucNzP4.Exists(kk) Then
            ws.Cells(outRow, 1).Value = "ODI SEM UC"
            ws.Cells(outRow, 2).Value = p4pep3b(kk)
            ws.Cells(outRow, 3).Value = kk
            If p4uc.Exists(kk) Then
                ws.Cells(outRow, 11).Value = "ODI (PEP .I) com TODAS as UC zeradas (MAT LIB SAP = 0)"
            Else
                ws.Cells(outRow, 11).Value = "ODI (PEP .I) sem nenhum item TIPO=UC"
            End If
            outRow = outRow + 1
        End If
        ' ODI sem nenhum material COM
        If p4odi(kk) And Not p4com.Exists(kk) Then
            ws.Cells(outRow, 1).Value = "ODI SEM COM"
            ws.Cells(outRow, 2).Value = p4pep3b(kk)
            ws.Cells(outRow, 3).Value = kk
            ws.Cells(outRow, 11).Value = "ODI (PEP .I) sem nenhum material TIPO=COM"
            outRow = outRow + 1
        End If
    Next kk

    ' --- PEP3 sem nenhuma UC ---
    Dim kP3 As Variant
    For Each kP3 In pep3All.Keys
        If Not pep3UCb.Exists(kP3) Then
            ws.Cells(outRow, 1).Value = "PEP SEM UC"
            ws.Cells(outRow, 2).Value = kP3
            ws.Cells(outRow, 3).Value = pep3All(kP3)
            ws.Cells(outRow, 11).Value = "PEP3 sem nenhum item TIPO=UC cadastrado"
            outRow = outRow + 1
        End If
    Next kP3

    For i = 1 To n
        pep3 = "" : pep4 = "" : tipo = "" : codMat = "" : descMat = "" : familia = ""
        If idxPep3 > 0 Then pep3 = Trim(CStr(d(i, idxPep3)))
        If idxPep4 > 0 Then pep4 = Trim(CStr(d(i, idxPep4)))
        If idxTipo > 0 Then tipo = NormStr(CStr(d(i, idxTipo)))
        If idxCod  > 0 Then codMat  = Trim(CStr(d(i, idxCod)))
        If idxDesc > 0 Then descMat = Trim(CStr(d(i, idxDesc)))
        If idxFam  > 0 Then familia = Trim(CStr(d(i, idxFam)))
        famN = NormStr(familia)
        valor = 0 : qtd = 0
        If idxValor > 0 Then valor = Val0(d(i, idxValor))
        If idxQtd   > 0 Then qtd   = Val0(d(i, idxQtd))
        If pep4 = "" Then GoTo ProxLinha2

        If (Right(pep4, 2) = ".M" Or InStr(pep4, ".M.") > 0) And InStr(famN, "POSTE") > 0 Then
            ws.Cells(outRow, 1).Value = "POSTE EM PEP .M"
            ws.Cells(outRow, 2).Value = pep3
            ws.Cells(outRow, 3).Value = pep4
            ws.Cells(outRow, 4).Value = codMat
            ws.Cells(outRow, 5).Value = descMat
            ws.Cells(outRow, 6).Value = familia
            ws.Cells(outRow, 7).Value = valor
            ws.Cells(outRow, 8).Value = qtd
            ws.Cells(outRow, 11).Value = "Poste em PEP4 com sufixo .M (ODM)"
            outRow = outRow + 1
        End If

        If (Right(pep4, 2) = ".S" Or InStr(pep4, ".S.") > 0) And InStr(famN, "POSTE") > 0 Then
            ws.Cells(outRow, 1).Value = "POSTE EM PEP .S"
            ws.Cells(outRow, 2).Value = pep3
            ws.Cells(outRow, 3).Value = pep4
            ws.Cells(outRow, 4).Value = codMat
            ws.Cells(outRow, 5).Value = descMat
            ws.Cells(outRow, 6).Value = familia
            ws.Cells(outRow, 7).Value = valor
            ws.Cells(outRow, 8).Value = qtd
            ws.Cells(outRow, 11).Value = "Poste em PEP4 com sufixo .S (ODS)"
            outRow = outRow + 1
        End If

        ' Sinal do material x tipo de OD (sufixo do PEP4):
        '  ODI/.I, ODM/.M, ODS/.S  -> esperado POSITIVO (instala/movimenta); negativo = alerta
        '  ODD/.D                  -> esperado NEGATIVO (desmonte); positivo = alerta
        Dim suf As String : suf = UCase(Right(pep4, 2))
        Dim odTp As String : odTp = ""
        Select Case suf
            Case ".I": odTp = "ODI"
            Case ".M": odTp = "ODM"
            Case ".S": odTp = "ODS"
            Case ".D": odTp = "ODD"
        End Select

        ' ODM: acumula medidores e lacres por PEP4 (regra 1 medidor = 2 lacres)
        If odTp = "ODM" Then
            Dim dN As String : dN = NormStr(descMat) & " " & famN
            If Not medPep3.Exists(pep4) Then medPep3.Add pep4, pep3
            If InStr(dN, "MEDIDOR") > 0 And InStr(dN, "CAIXA") = 0 Then
                If medP4.Exists(pep4) Then medP4(pep4) = medP4(pep4) + qtd Else medP4.Add pep4, qtd
            ElseIf InStr(dN, "LACRE") > 0 Then
                If lacreP4.Exists(pep4) Then lacreP4(pep4) = lacreP4(pep4) + qtd Else lacreP4.Add pep4, qtd
            End If
        End If
        If (odTp = "ODI" Or odTp = "ODM" Or odTp = "ODS") And qtd < 0 And codMat <> "" Then
            ws.Cells(outRow, 1).Value = "MATERIAL NEGATIVO"
            ws.Cells(outRow, 2).Value = pep3
            ws.Cells(outRow, 3).Value = pep4
            ws.Cells(outRow, 4).Value = codMat
            ws.Cells(outRow, 5).Value = descMat
            ws.Cells(outRow, 6).Value = familia
            ws.Cells(outRow, 7).Value = valor
            ws.Cells(outRow, 8).Value = qtd
            ws.Cells(outRow, 11).Value = "Material NEGATIVO em PEP " & odTp & " (esperado positivo)"
            outRow = outRow + 1
        ElseIf odTp = "ODD" And qtd > 0 And codMat <> "" Then
            ws.Cells(outRow, 1).Value = "MATERIAL POSITIVO EM ODD"
            ws.Cells(outRow, 2).Value = pep3
            ws.Cells(outRow, 3).Value = pep4
            ws.Cells(outRow, 4).Value = codMat
            ws.Cells(outRow, 5).Value = descMat
            ws.Cells(outRow, 6).Value = familia
            ws.Cells(outRow, 7).Value = valor
            ws.Cells(outRow, 8).Value = qtd
            ws.Cells(outRow, 11).Value = "Material POSITIVO em PEP ODD (esperado negativo / desmonte)"
            outRow = outRow + 1
        End If

        If tipo = "UC" And Left(famN, 4) <> "COND" And Left(famN, 4) <> "CABO" Then
            If codMat <> "" Then
                Dim codMatNorm As String : codMatNorm = NormCod(codMat)
                If precos.Exists(codMatNorm) And qtd > 0 And valor > 0 Then
                    refP = precos(codMatNorm) : unit = valor / qtd
                    Dim tolSub As Double : tolSub = CfgD("TOL_SUBVAL", 0.9)
                    Dim minDiv As Double : minDiv = CfgD("MIN_DIVERG_RS", 100)
                    If refP > 0 And unit < refP * tolSub And (refP - unit) * qtd >= minDiv Then
                        ws.Cells(outRow, 1).Value = "UC SUBVALORIZADO"
                        ws.Cells(outRow, 2).Value = pep3
                        ws.Cells(outRow, 3).Value = pep4
                        ws.Cells(outRow, 4).Value = codMat
                        ws.Cells(outRow, 5).Value = descMat
                        ws.Cells(outRow, 6).Value = familia
                        ws.Cells(outRow, 7).Value = valor
                        ws.Cells(outRow, 8).Value = qtd
                        ws.Cells(outRow, 9).Value = unit
                        ws.Cells(outRow, 10).Value = refP
                        ws.Cells(outRow, 11).Value = "PU " & Format(unit, "#,##0.00") & " abaixo de " & Format(tolSub, "0%") & " da referencia (" & Format(refP, "#,##0.00") & ")"
                        outRow = outRow + 1
                    End If
                ElseIf codMatNorm <> "" And qtd > 0 And valor > 0 Then
                    ws.Cells(outRow, 1).Value = "UC - PRECO NAO ENCONTRADO"
                    ws.Cells(outRow, 2).Value = pep3
                    ws.Cells(outRow, 3).Value = pep4
                    ws.Cells(outRow, 4).Value = codMat
                    ws.Cells(outRow, 5).Value = descMat
                    ws.Cells(outRow, 6).Value = familia
                    ws.Cells(outRow, 7).Value = valor
                    ws.Cells(outRow, 8).Value = qtd
                    ws.Cells(outRow, 11).Value = "Material nao tem preco referencia cadastrado na aba PRECOS"
                    outRow = outRow + 1
                End If
            Else
                ws.Cells(outRow, 1).Value = "UC - COD MATERIAL VAZIO"
                ws.Cells(outRow, 2).Value = pep3
                ws.Cells(outRow, 3).Value = pep4
                ws.Cells(outRow, 5).Value = descMat
                ws.Cells(outRow, 6).Value = familia
                ws.Cells(outRow, 7).Value = valor
                ws.Cells(outRow, 11).Value = "Codigo de material nao preenchido"
                outRow = outRow + 1
            End If
        End If
ProxLinha2:
    Next i

    ' --- ODM: valida 1 medidor = 2 lacres (por PEP4) ---
    Dim kMed As Variant
    For Each kMed In medP4.Keys
        Dim qMed As Double : qMed = medP4(kMed)
        Dim qLac As Double : qLac = 0
        If lacreP4.Exists(kMed) Then qLac = lacreP4(kMed)
        Dim espLac As Double : espLac = 2 * qMed
        If qMed > 0 And qLac <> espLac Then
            ws.Cells(outRow, 1).Value = "LACRE x MEDIDOR"
            ws.Cells(outRow, 2).Value = medPep3(kMed)
            ws.Cells(outRow, 3).Value = kMed
            ws.Cells(outRow, 6).Value = "MEDIDOR / LACRE"
            ws.Cells(outRow, 8).Value = qLac
            ws.Cells(outRow, 10).Value = espLac
            ws.Cells(outRow, 11).Value = Format(qMed, "#,##0") & " medidor(es) -> esperado " & _
                Format(espLac, "#,##0") & " lacres, veio " & Format(qLac, "#,##0") & _
                IIf(qLac < espLac, " (FALTAM " & Format(espLac - qLac, "#,##0") & ")", _
                                   " (SOBRAM " & Format(qLac - espLac, "#,##0") & ")")
            outRow = outRow + 1
        End If
    Next kMed
    ' lacre sem medidor no ODM
    Dim kLac As Variant
    For Each kLac In lacreP4.Keys
        If Not medP4.Exists(kLac) And lacreP4(kLac) <> 0 Then
            ws.Cells(outRow, 1).Value = "LACRE x MEDIDOR"
            ws.Cells(outRow, 2).Value = medPep3(kLac)
            ws.Cells(outRow, 3).Value = kLac
            ws.Cells(outRow, 6).Value = "MEDIDOR / LACRE"
            ws.Cells(outRow, 8).Value = lacreP4(kLac)
            ws.Cells(outRow, 10).Value = 0
            ws.Cells(outRow, 11).Value = "Lacre sem medidor no PEP ODM (veio " & Format(lacreP4(kLac), "#,##0") & ")"
            outRow = outRow + 1
        End If
    Next kLac

    ' --- Importa discrepancias de PRECO UNITARIO ---
    Dim wsPU As Worksheet
    On Error Resume Next
    Set wsPU = ws.Parent.Worksheets("PRECO UNITARIO")
    On Error GoTo 0
    If Not wsPU Is Nothing Then
        Dim lastRowP As Long : lastRowP = wsPU.Cells(wsPU.Rows.Count, 1).End(xlUp).Row
        If lastRowP >= 2 Then
            ' 1 PEP3|2 PEP4|3 TIPO|4 COD|5 DESC|6 UND|7 QTD|8 VALOR|9 PU|10 MIN|11 MAX|12 STATUS|13 OBS
            Dim pD As Variant : pD = wsPU.Range(wsPU.Cells(2, 1), wsPU.Cells(lastRowP, 13)).Value
            Dim rp As Long, stP As String
            For rp = 1 To UBound(pD, 1)
                stP = Trim(CStr(pD(rp, 12)))
                If stP = "ABAIXO DO MINIMO" Or stP = "ACIMA DO MAXIMO" Then
                    ws.Cells(outRow, 1).Value = IIf(stP = "ABAIXO DO MINIMO", "PU ABAIXO MIN", "PU ACIMA MAX")
                    ws.Cells(outRow, 2).Value = pD(rp, 1)   ' PEP3
                    ws.Cells(outRow, 3).Value = pD(rp, 2)   ' PEP4
                    ws.Cells(outRow, 4).Value = pD(rp, 4)   ' COD
                    ws.Cells(outRow, 5).Value = pD(rp, 5)   ' DESC
                    ws.Cells(outRow, 6).Value = pD(rp, 3)   ' TIPO (na col familia)
                    ws.Cells(outRow, 7).Value = pD(rp, 8)   ' VALOR
                    ws.Cells(outRow, 8).Value = pD(rp, 7)   ' QTD
                    ws.Cells(outRow, 9).Value = pD(rp, 9)   ' PU
                    ws.Cells(outRow, 10).Value = IIf(stP = "ABAIXO DO MINIMO", pD(rp, 10), pD(rp, 11)) ' ref
                    ws.Cells(outRow, 11).Value = pD(rp, 13) ' MOTIVO (obs)
                    outRow = outRow + 1
                End If
            Next rp
        End If
    End If

Finaliza2:
    Dim totAl As Long : totAl = outRow - 2
    Dim wds As Variant
    wds = Array(22, 24, 26, 12, 46, 18, 12, 9, 12, 12, 42)
    For c = 1 To 11
        ws.Columns(c).ColumnWidth = wds(c - 1)
    Next c

    ' Formatacao em LOTE: le os dados de volta em array (1 chamada), calcula o
    ' PU em memoria, aplica a base numa chamada so e pinta BLOCOS de linhas
    ' consecutivas com o mesmo tipo de alerta.
    If totAl > 0 Then
        Dim dA As Variant
        dA = ws.Range(ws.Cells(2, 1), ws.Cells(outRow - 1, 11)).Value

        ' PRECO UNIT = VALOR / QTD (col 9 = col 7 / col 8), calculado em memoria
        Dim puCol() As Variant : ReDim puCol(1 To totAl, 1 To 1)
        Dim rAlert As Long
        For rAlert = 1 To totAl
            Dim vAl As Double : vAl = Val0(dA(rAlert, 7))
            Dim qAl As Double : qAl = Val0(dA(rAlert, 8))
            If qAl <> 0 Then puCol(rAlert, 1) = vAl / qAl Else puCol(rAlert, 1) = dA(rAlert, 9)
        Next rAlert
        ws.Range(ws.Cells(2, 9), ws.Cells(outRow - 1, 9)).Value = puCol

        With ws.Range(ws.Cells(2, 1), ws.Cells(outRow - 1, 11))
            .Font.Name = "Segoe UI" : .Font.Size = 10 : .Font.Color = RGB(45, 52, 64)
            .VerticalAlignment = xlCenter
            .Borders(xlInsideHorizontal).LineStyle = xlContinuous
            .Borders(xlInsideHorizontal).Color = RGB(255, 255, 255)
            .Borders(xlEdgeBottom).LineStyle = xlContinuous
            .Borders(xlEdgeBottom).Color = RGB(255, 255, 255)
        End With
        ws.Range(ws.Cells(2, 7), ws.Cells(outRow - 1, 10)).NumberFormat = "#,##0.00"

        Dim iA As Long, iIni As Long, tA As String
        iA = 1
        Do While iA <= totAl
            tA = Trim(CStr(dA(iA, 1))) : iIni = iA
            Do While iA < totAl
                If Trim(CStr(dA(iA + 1, 1))) <> tA Then Exit Do
                iA = iA + 1
            Loop
            Dim bgA As Long, chip As Long
            Select Case tA
                Case "ODI SEM UC":                bgA = RGB(255, 244, 214) : chip = RGB(214, 158, 0)
                Case "PEP SEM UC":                bgA = RGB(255, 238, 230) : chip = RGB(196, 89, 17)
                Case "ODI SEM COM":               bgA = RGB(230, 240, 248) : chip = RGB(46, 117, 182)
                Case "PU ABAIXO MIN":             bgA = RGB(255, 244, 214) : chip = RGB(176, 124, 0)
                Case "PU ACIMA MAX":              bgA = RGB(252, 226, 228) : chip = RGB(192, 0, 0)
                Case "MATERIAL NEGATIVO":         bgA = RGB(252, 226, 228) : chip = RGB(192, 0, 0)
                Case "MATERIAL POSITIVO EM ODD":  bgA = RGB(252, 233, 219) : chip = RGB(214, 99, 0)
                Case "LACRE x MEDIDOR":           bgA = RGB(225, 223, 245) : chip = RGB(96, 64, 196)
                Case "POSTE EM PEP .M":           bgA = RGB(222, 236, 250) : chip = RGB(31, 107, 183)
                Case "POSTE EM PEP .S":           bgA = RGB(220, 245, 240) : chip = RGB(15, 130, 115)
                Case "UC SUBVALORIZADO":          bgA = RGB(252, 226, 228) : chip = RGB(192, 0, 0)
                Case "UC - PRECO NAO ENCONTRADO": bgA = RGB(255, 244, 214) : chip = RGB(176, 124, 0)
                Case "UC - COD MATERIAL VAZIO":   bgA = RGB(238, 238, 238) : chip = RGB(110, 110, 110)
                Case Else:                        bgA = RGB(245, 245, 245) : chip = RGB(120, 120, 120)
            End Select
            ws.Range(ws.Cells(1 + iIni, 1), ws.Cells(1 + iA, 11)).Interior.Color = bgA
            ' "chip" colorido do tipo de alerta (col 1)
            With ws.Range(ws.Cells(1 + iIni, 1), ws.Cells(1 + iA, 1))
                .Interior.Color = chip
                .Font.Bold = True : .Font.Size = 9 : .Font.Color = RGB(255, 255, 255)
                .HorizontalAlignment = xlCenter
            End With
            iA = iA + 1
        Loop
    End If

    ' --- Banda de titulo no topo (insere 2 linhas) ---
    ws.Range("1:2").Insert Shift:=xlDown
    With ws.Range("A1:K2")
        .Merge
        .Value = ChrW(&H26A0) & "  PAINEL DE ALERTAS CRITICOS"
        .Font.Name = "Segoe UI Semibold" : .Font.Size = 18 : .Font.Bold = True
        .Font.Color = RGB(255, 255, 255) : .Interior.Color = RGB(176, 0, 0)
        .HorizontalAlignment = xlCenter : .VerticalAlignment = xlCenter
    End With
    ws.Rows(1).RowHeight = 22 : ws.Rows(2).RowHeight = 22

    If totAl = 0 Then
        ws.Cells(4, 1).Value = "Nenhum alerta critico encontrado nesta base."
        ws.Cells(4, 1).Font.Italic = True : ws.Cells(4, 1).Font.Color = RGB(0, 128, 0)
    Else
        ws.Range(ws.Cells(3, 1), ws.Cells(3, 11)).AutoFilter
    End If

    On Error Resume Next
    ws.Activate
    ActiveWindow.DisplayGridlines = False
    ws.Range("A4").Select
    ActiveWindow.FreezePanes = True
    On Error GoTo 0
    ws.Range("A1").Select
End Sub

Private Function Val0(v As Variant) As Double
    On Error Resume Next
    If IsNumeric(v) Then Val0 = CDbl(v) Else Val0 = 0
    On Error GoTo 0
End Function

' Carrega precos de uma aba "PRECOS" (codigo na col 1, preco na col 2)
' Retorna Dictionary vazio se aba nao existir
Private Function CarregarPrecos(wb As Workbook) As Object
    Dim precos As Object : Set precos = CreateObject("Scripting.Dictionary")

    Dim wsPrecos As Worksheet
    On Error Resume Next
    Set wsPrecos = wb.Worksheets("PRECOS")
    On Error GoTo 0

    If Not wsPrecos Is Nothing Then
        Dim lastRow As Long
        lastRow = wsPrecos.Cells(wsPrecos.Rows.Count, 1).End(xlUp).Row
        If lastRow >= 2 Then
            ' leitura em array (1 chamada) em vez de celula a celula
            Dim dPr As Variant : dPr = wsPrecos.Range(wsPrecos.Cells(2, 1), wsPrecos.Cells(lastRow, 2)).Value
            Dim r As Long
            For r = 1 To UBound(dPr, 1)
                Dim cod As String : cod = NormCod(dPr(r, 1))
                Dim preco As Double : preco = Val0(dPr(r, 2))
                If cod <> "" And preco > 0 Then
                    If Not precos.Exists(cod) Then precos.Add cod, preco
                End If
            Next r
        End If
    End If

    ' Fallback: se nao houver aba "PRECOS", deriva preco = ponto medio (MIN+MAX)/2
    ' da BASE DE PRECOS (aba interna ou arquivo externo).
    If precos.Count = 0 Then
        Dim fx As Object : Set fx = CarregarFaixaPrecos(wb)
        Dim k As Variant, p() As String, mn As Double, mx As Double, md As Double
        For Each k In fx.Keys
            p = Split(CStr(fx(k)), "|")
            mn = Val0(p(0)) : mx = Val0(p(1))
            If mx <= 0 Then mx = mn
            md = (mn + mx) / 2
            If md > 0 Then precos.Add CStr(k), md
        Next k
    End If

    Set CarregarPrecos = precos
End Function

' Localiza o arquivo externo da base de precos. NAO usa literais acentuados
' (que corrompem na importacao do .bas no VBA). Usa ChrW(193)=A-acento e
' curinga '?' no lugar do C-cedilha. Retorna o caminho completo ou "".
Private Function CaminhoBasePrecos(wb As Workbook) As String
    ' '?' casa PRECOS e PRE<cedilha>OS; nao pega 'BASE DE PRECOS A CLASSIFICAR.xlsx'
    Dim padrao As String : padrao = "BASE DE PRE?OS.xlsx"

    ' 'Area de Trabalho' montado com ChrW p/ evitar corrupcao de encoding
    Dim areaTrab As String : areaTrab = ChrW(193) & "rea de Trabalho"
    Dim up As String : up = Environ$("USERPROFILE")

    Dim pastas() As String
    pastas = Split( _
        wb.Path & "|" & _
        up & "\OneDrive - GRUPO EQUATORIAL ENERGIA\" & areaTrab & "\claude" & "|" & _
        up & "\OneDrive\" & areaTrab & "\claude" & "|" & _
        up & "\" & areaTrab & "\claude" & "|" & _
        up & "\Desktop\claude", "|")

    Dim i As Long, ach As String
    For i = LBound(pastas) To UBound(pastas)
        If Len(pastas(i)) > 0 Then
            ach = Dir(pastas(i) & "\" & padrao)
            If Len(ach) > 0 Then
                CaminhoBasePrecos = pastas(i) & "\" & ach
                Exit Function
            End If
        End If
    Next i
    CaminhoBasePrecos = ""
End Function

' Carrega faixa MIN/MAX de preco unitario.
' 1) tenta aba interna "BASE PRECOS"/"BASE DE PRECOS"/"BASE DE PRECOS" (com cedilha);
' 2) se nao houver, abre o arquivo externo BASE DE PRECOS.xlsx (read-only).
' Colunas: MATERIAL | TEXTO MATERIAL | UML | MIN PU | MAX PU | CLS2 | CLASSIFICACAO
' Retorna Dictionary: codNorm -> "minPU|maxPU|texto"
Private Function CarregarFaixaPrecos(wb As Workbook) As Object
    ' usa cache de execucao se disponivel
    If Not mFaixaCache Is Nothing Then
        Set CarregarFaixaPrecos = mFaixaCache : Exit Function
    End If
    Dim fx As Object : Set fx = CreateObject("Scripting.Dictionary")
    Dim wsP As Worksheet
    Dim wbExt As Workbook       ' workbook externo aberto por nos (p/ fechar depois)
    Set wbExt = Nothing

    ' --- 1) aba interna ---
    On Error Resume Next
    Set wsP = wb.Worksheets("BASE PRECOS")
    If wsP Is Nothing Then Set wsP = wb.Worksheets("BASE DE PRECOS")
    If wsP Is Nothing Then Set wsP = wb.Worksheets("BASE DE PRE" & ChrW(199) & "OS")
    On Error GoTo 0

    ' --- 2) arquivo externo ---
    If wsP Is Nothing Then
        Dim cam As String : cam = CaminhoBasePrecos(wb)
        If Len(cam) = 0 Then Set CarregarFaixaPrecos = fx : Exit Function
        Dim nomeArq As String : nomeArq = Dir(cam)
        On Error Resume Next
        Dim wbJa As Workbook : Set wbJa = Workbooks(nomeArq)   ' ja aberto?
        On Error GoTo 0
        If wbJa Is Nothing Then
            On Error Resume Next
            Set wbExt = Workbooks.Open(cam, ReadOnly:=True, UpdateLinks:=0)
            On Error GoTo 0
            If wbExt Is Nothing Then Set CarregarFaixaPrecos = fx : Exit Function
            Set wsP = wbExt.Worksheets(1)
        Else
            Set wsP = wbJa.Worksheets(1)
        End If
    End If
    If wsP Is Nothing Then Set CarregarFaixaPrecos = fx : Exit Function

    Dim lastC As Long : lastC = wsP.Cells(1, wsP.Columns.Count).End(xlToLeft).Column
    Dim cMat As Long, cTxt As Long, cMin As Long, cMax As Long
    Dim c As Long, h As String
    For c = 1 To lastC
        h = NormStr(CStr(wsP.Cells(1, c).Value))
        Select Case h
            Case "MATERIAL":        cMat = c
            Case "TEXTO MATERIAL":  cTxt = c
            Case "MIN PU":          cMin = c
            Case "MAX PU":          cMax = c
        End Select
    Next c
    If cMat = 0 Then cMat = 1
    If cTxt = 0 Then cTxt = 2
    If cMin = 0 Then cMin = 4
    If cMax = 0 Then cMax = 5

    Dim lastR As Long : lastR = wsP.Cells(wsP.Rows.Count, cMat).End(xlUp).Row
    If lastR >= 2 Then
        Dim dd As Variant : dd = wsP.Range(wsP.Cells(2, 1), wsP.Cells(lastR, lastC)).Value
        Dim r As Long
        For r = 1 To UBound(dd, 1)
            Dim cod As String : cod = NormCod(dd(r, cMat))
            If cod <> "" And Not fx.Exists(cod) Then
                fx.Add cod, Val0(dd(r, cMin)) & "|" & Val0(dd(r, cMax)) & "|" & Trim(CStr(dd(r, cTxt)))
            End If
        Next r
    End If

    If Not wbExt Is Nothing Then wbExt.Close SaveChanges:=False
    Set mFaixaCache = fx
    Set CarregarFaixaPrecos = fx
End Function

' ===========================================================================
'  ABA PRECO UNITARIO: PU = VALOR/QTD x faixa MIN/MAX (BASE PRECOS)
' ===========================================================================
Private Sub ProcessarPrecoUnitario(wsBase As Worksheet, ws As Worksheet)

    Dim fx As Object : Set fx = CarregarFaixaPrecos(wsBase.Parent)

    Dim lastC As Long : lastC = wsBase.Cells(1, wsBase.Columns.Count).End(xlToLeft).Column
    Dim iPep3 As Long, iPep4 As Long, iCod As Long, iDesc As Long
    Dim iFam As Long, iTipo As Long, iVal As Long, iQtd As Long, iUml As Long
    Dim iTipoPep As Long
    Dim c As Long, h As String
    For c = 1 To lastC
        h = NormStr(CStr(wsBase.Cells(1, c).Value))
        Select Case h
            Case "PEP3NIVEL":   iPep3 = c
            Case "PEP4NIVEL":   iPep4 = c
            Case "COD MAT":     iCod = c
            Case "DESC MAT":    iDesc = c
            Case "FAMILIA":     iFam = c
            Case "TIPO":        iTipo = c
            Case "VALOR":       iVal = c
            Case "MAT LIB SAP": iQtd = c
            Case "UND":         iUml = c
            Case "TIPO PEP":    iTipoPep = c
        End Select
    Next c

    ' Cabecalho
    Dim hdrs As Variant
    hdrs = Array("PEP3NIVEL", "PEP4NIVEL", "TIPO", "COD MAT", "DESC MAT", "UND", _
                 "QTD", "VALOR", "PU (VALOR/QTD)", "MIN PU", "MAX PU", "STATUS", "OBSERVACAO", "TIPO OD")
    For c = 1 To 14
        With ws.Cells(1, c)
            .Value = hdrs(c - 1)
            .Font.Name = "Segoe UI Semibold" : .Font.Bold = True : .Font.Size = 10
            .Font.Color = RGB(235, 240, 248) : .Interior.Color = RGB(17, 24, 39)
            .HorizontalAlignment = xlCenter : .VerticalAlignment = xlCenter
            .Borders.LineStyle = xlContinuous : .Borders.Color = RGB(60, 70, 90)
        End With
    Next c
    ws.Rows(1).RowHeight = 28

    Dim refCol As Long : refCol = iCod : If refCol = 0 Then refCol = 1
    Dim lastR As Long : lastR = wsBase.Cells(wsBase.Rows.Count, refCol).End(xlUp).Row
    Dim outRow As Long : outRow = 2
    Dim nOut As Long : nOut = 0
    Dim stArr() As String
    If lastR >= 2 Then
        Dim d As Variant : d = wsBase.Range(wsBase.Cells(2, 1), wsBase.Cells(lastR, lastC)).Value
        ' Saida bufferizada: monta as linhas em array e escreve UMA vez no final
        Dim outA() As Variant : ReDim outA(1 To UBound(d, 1), 1 To 14)
        ReDim stArr(1 To UBound(d, 1))
        Dim i As Long
        For i = 1 To UBound(d, 1)
            Dim cod As String : cod = "" : If iCod > 0 Then cod = NormCod(d(i, iCod))
            Dim qtd As Double : qtd = 0 : If iQtd > 0 Then qtd = Val0(d(i, iQtd))
            Dim vlrPU As Double : vlrPU = 0 : If iVal > 0 Then vlrPU = Val0(d(i, iVal))
            If cod = "" Or qtd = 0 Or vlrPU = 0 Then GoTo Prox
            Dim pu As Double : pu = vlrPU / qtd
            Dim mn As Double : mn = 0 : Dim mx As Double : mx = 0
            Dim temFx As Boolean : temFx = fx.Exists(cod)
            Dim st As String, obs As String
            If temFx Then
                Dim p() As String : p = Split(CStr(fx(cod)), "|")
                mn = Val0(p(0)) : mx = Val0(p(1))
                If pu < mn Then
                    st = "ABAIXO DO MINIMO"
                    obs = "PU " & Format(pu, "#,##0.00") & " < min " & Format(mn, "#,##0.00")
                ElseIf pu > mx Then
                    st = "ACIMA DO MAXIMO"
                    obs = "PU " & Format(pu, "#,##0.00") & " > max " & Format(mx, "#,##0.00")
                Else
                    st = "DENTRO"
                    obs = "Dentro da faixa (" & Format(mn, "#,##0.00") & " a " & Format(mx, "#,##0.00") & ")"
                End If
            Else
                st = "SEM REFERENCIA"
                obs = "Material sem faixa na BASE PRECOS"
            End If

            nOut = nOut + 1
            outA(nOut, 1) = IIf(iPep3 > 0, d(i, iPep3), "")
            outA(nOut, 2) = IIf(iPep4 > 0, d(i, iPep4), "")
            outA(nOut, 3) = IIf(iTipo > 0, d(i, iTipo), "")
            outA(nOut, 4) = cod
            outA(nOut, 5) = IIf(iDesc > 0, d(i, iDesc), "")
            outA(nOut, 6) = IIf(iUml > 0, d(i, iUml), "")
            outA(nOut, 7) = qtd
            outA(nOut, 8) = vlrPU
            outA(nOut, 9) = pu
            outA(nOut, 10) = IIf(temFx, mn, "")
            outA(nOut, 11) = IIf(temFx, mx, "")
            ' CORRECAO: STATUS vai na coluna 12 (antes era escrito na 11 por cima
            ' do MAX PU, deixando a coluna STATUS vazia - o que quebrava as cores
            ' da aba, a importacao de alertas de PU, o ranking e o painel)
            outA(nOut, 12) = st
            outA(nOut, 13) = obs
            stArr(nOut) = st

            ' TIPO OD: classifica o PEP pelo sufixo do PEP4 (.I/.M/.S/.D) ou pela coluna TIPO PEP
            Dim pep4OD As String : pep4OD = "" : If iPep4 > 0 Then pep4OD = UCase(Trim(CStr(d(i, iPep4))))
            Dim tpRaw As String : tpRaw = "" : If iTipoPep > 0 Then tpRaw = UCase(Trim(CStr(d(i, iTipoPep))))
            Dim tipoOD As String
            If Right(pep4OD, 2) = ".I" Then
                tipoOD = "ODI"
            ElseIf Right(pep4OD, 2) = ".M" Then
                tipoOD = "ODM"
            ElseIf Right(pep4OD, 2) = ".S" Then
                tipoOD = "ODS"
            ElseIf Right(pep4OD, 2) = ".D" Then
                tipoOD = "ODD"
            ElseIf tpRaw = "I" Then
                tipoOD = "ODI"
            ElseIf tpRaw = "M" Then
                tipoOD = "ODM"
            ElseIf tpRaw = "S" Then
                tipoOD = "ODS"
            ElseIf tpRaw = "D" Then
                tipoOD = "ODD"
            Else
                tipoOD = "-"
            End If
            outA(nOut, 14) = tipoOD
Prox:
        Next i
        If nOut > 0 Then ws.Range(ws.Cells(2, 1), ws.Cells(1 + nOut, 14)).Value = outA
    End If
    outRow = 2 + nOut

    ' Formatacao
    Dim wds As Variant : wds = Array(24, 26, 8, 13, 46, 6, 10, 12, 14, 11, 11, 18, 40, 9)
    For c = 1 To 14 : ws.Columns(c).ColumnWidth = wds(c - 1) : Next c

    ' Formatacao das linhas em LOTE: base numa chamada so; cores por BLOCOS de
    ' linhas consecutivas com o mesmo status, lendo do array (sem reler celulas)
    If nOut > 0 Then
        With ws.Range(ws.Cells(2, 1), ws.Cells(1 + nOut, 14))
            .Font.Name = "Segoe UI" : .Font.Size = 9 : .Font.Color = RGB(45, 52, 64)
            .VerticalAlignment = xlCenter
            .Borders(xlInsideHorizontal).LineStyle = xlContinuous
            .Borders(xlInsideHorizontal).Color = RGB(255, 255, 255)
            .Borders(xlEdgeBottom).LineStyle = xlContinuous
            .Borders(xlEdgeBottom).Color = RGB(255, 255, 255)
        End With
        ws.Range(ws.Cells(2, 7), ws.Cells(1 + nOut, 11)).NumberFormat = "#,##0.00"
        With ws.Range(ws.Cells(2, 14), ws.Cells(1 + nOut, 14))
            .Font.Bold = True : .HorizontalAlignment = xlCenter : .Font.Color = RGB(31, 41, 59)
        End With

        Dim rr As Long, rIni As Long, stB As String, bg As Long, chip As Long
        rr = 1
        Do While rr <= nOut
            stB = stArr(rr) : rIni = rr
            Do While rr < nOut
                If stArr(rr + 1) <> stB Then Exit Do
                rr = rr + 1
            Loop
            Select Case stB
                Case "DENTRO":           bg = RGB(231, 244, 234) : chip = RGB(33, 130, 70)
                Case "ABAIXO DO MINIMO": bg = RGB(255, 244, 214) : chip = RGB(176, 124, 0)
                Case "ACIMA DO MAXIMO":  bg = RGB(252, 226, 228) : chip = RGB(192, 0, 0)
                Case Else:               bg = RGB(238, 238, 238) : chip = RGB(110, 110, 110)
            End Select
            ws.Range(ws.Cells(1 + rIni, 1), ws.Cells(1 + rr, 14)).Interior.Color = bg
            With ws.Range(ws.Cells(1 + rIni, 12), ws.Cells(1 + rr, 12))
                .Interior.Color = chip : .Font.Color = RGB(255, 255, 255) : .Font.Bold = True
                .HorizontalAlignment = xlCenter
            End With
            rr = rr + 1
        Loop
    End If

    If outRow > 2 Then ws.Range("A1:N1").AutoFilter
    On Error Resume Next
    ws.Activate
    ActiveWindow.DisplayGridlines = False
    ws.Range("A2").Select
    ActiveWindow.FreezePanes = True
    On Error GoTo 0
    ws.Range("A1").Select
End Sub


' ===========================================================================
'  RANKING DE RISCO POR OBRA (PEP3)
'  Consolida TODOS os sinais de auditoria ja gerados (reprovacao SAP x PRJ,
'  alertas criticos, divergencias de preco unitario e racionalizacao NT.006)
'  num SCORE 0-100 por obra, ordenado do maior risco para o menor.
'  Responde a pergunta do auditor: "qual obra eu olho primeiro?"
' ===========================================================================
Private Sub ProcessarRankingRisco(wb As Workbook, wsDet As Worksheet, _
        wsCom As Worksheet, wsPU As Worksheet, wsAlertaC As Worksheet)

    ' Pesos do score (ajustaveis na aba CONFIG; soma maxima = 100)
    Dim PESO_REPROV As Double : PESO_REPROV = CfgD("PESO_REPROV", 40)  ' obra reprovada
    Dim PESO_ALERTA As Double : PESO_ALERTA = CfgD("PESO_ALERTA", 4)   ' por alerta critico
    Dim CAP_ALERTA As Double : CAP_ALERTA = CfgD("CAP_ALERTA", 24)     ' teto alertas
    Dim PESO_PU As Double : PESO_PU = CfgD("PESO_PU", 3)               ' por diverg. de PU
    Dim CAP_PU As Double : CAP_PU = CfgD("CAP_PU", 18)                 ' teto PU
    Dim PESO_COM As Double : PESO_COM = CfgD("PESO_COM", 2)            ' por COM fora NT.006
    Dim CAP_COM As Double : CAP_COM = CfgD("CAP_COM", 18)             ' teto COM

    Dim ws As Worksheet
    Set ws = wb.Worksheets.Add(After:=wsAlertaC)
    ws.Name = "RANKING DE RISCO"

    ' ---------------- coleta por PEP3 ----------------
    Dim valOb As Object : Set valOb = CreateObject("Scripting.Dictionary")  ' valor total
    Dim repOb As Object : Set repOb = CreateObject("Scripting.Dictionary")  ' reprovado?
    Dim alOb  As Object : Set alOb  = CreateObject("Scripting.Dictionary")  ' n alertas
    Dim puOb  As Object : Set puOb  = CreateObject("Scripting.Dictionary")  ' n diverg PU
    Dim sobOb As Object : Set sobOb = CreateObject("Scripting.Dictionary")  ' sobrepreco R$
    Dim comOb As Object : Set comOb = CreateObject("Scripting.Dictionary")  ' n COM fora

    Dim r As Long, p3 As String

    ' 1) ANALISE SAP x PRJ (dados a partir da linha 10): valor + aprovacao
    Dim lastD As Long : lastD = wsDet.Cells(wsDet.Rows.Count, 1).End(xlUp).Row
    If lastD >= 10 Then
        Dim dd As Variant : dd = wsDet.Range(wsDet.Cells(10, 1), wsDet.Cells(lastD, 15)).Value
        For r = 1 To UBound(dd, 1)
            p3 = Trim(CStr(dd(r, 1)))
            If p3 <> "" Then
                If Not valOb.Exists(p3) Then valOb.Add p3, 0#
                valOb(p3) = valOb(p3) + Abs(Val0(dd(r, 6)))
                If Not repOb.Exists(p3) Then repOb.Add p3, False
                If InStr(UCase(CStr(dd(r, 14))), "REPROVADO") > 0 Then repOb(p3) = True
            End If
        Next r
    End If

    ' 2) ALERTA CRITICO (dados a partir da linha 4, col 2 = PEP3) - leitura em array
    Dim lastA As Long : lastA = wsAlertaC.Cells(wsAlertaC.Rows.Count, 1).End(xlUp).Row
    If lastA >= 4 Then
        Dim aa As Variant : aa = wsAlertaC.Range(wsAlertaC.Cells(4, 1), wsAlertaC.Cells(lastA, 2)).Value
        For r = 1 To UBound(aa, 1)
            p3 = Trim(CStr(aa(r, 2)))
            If p3 <> "" Then
                If alOb.Exists(p3) Then alOb(p3) = alOb(p3) + 1 Else alOb.Add p3, 1
                If Not valOb.Exists(p3) Then valOb.Add p3, 0#
            End If
        Next r
    End If

    ' 3) PRECO UNITARIO (linha 2+): diverg + sobrepreco potencial
    Dim lastP As Long : lastP = wsPU.Cells(wsPU.Rows.Count, 1).End(xlUp).Row
    If lastP >= 2 Then
        Dim pp As Variant : pp = wsPU.Range(wsPU.Cells(2, 1), wsPU.Cells(lastP, 13)).Value
        For r = 1 To UBound(pp, 1)
            p3 = Trim(CStr(pp(r, 1)))
            Dim stP As String : stP = UCase(Trim(CStr(pp(r, 12))))
            If p3 <> "" And (stP = "ABAIXO DO MINIMO" Or stP = "ACIMA DO MAXIMO") Then
                If puOb.Exists(p3) Then puOb(p3) = puOb(p3) + 1 Else puOb.Add p3, 1
                If Not valOb.Exists(p3) Then valOb.Add p3, 0#
                If stP = "ACIMA DO MAXIMO" Then
                    Dim qq As Double : qq = Val0(pp(r, 7))
                    Dim puu As Double : puu = Val0(pp(r, 9))
                    Dim mxx As Double : mxx = Val0(pp(r, 11))
                    If puu > mxx And qq > 0 Then
                        If Not sobOb.Exists(p3) Then sobOb.Add p3, 0#
                        sobOb(p3) = sobOb(p3) + (puu - mxx) * qq
                    End If
                End If
            End If
        Next r
    End If

    ' 4) RACIONALIZACAO COM (linha 3+, col 2 = PEP3, col 9 = STATUS rotulo) - array
    Dim lastM As Long : lastM = wsCom.Cells(wsCom.Rows.Count, 1).End(xlUp).Row
    If lastM >= 3 Then
        Dim mm As Variant : mm = wsCom.Range(wsCom.Cells(3, 1), wsCom.Cells(lastM, 9)).Value
        For r = 1 To UBound(mm, 1)
            p3 = Trim(CStr(mm(r, 2)))
            Dim stC As String : stC = UCase(Trim(CStr(mm(r, 9))))
            If p3 <> "" Then
                If stC = "FALTANDO" Or stC = "EXCESSO" Or stC = "EXAGERADO" Or stC = "ZERO" Then
                    If comOb.Exists(p3) Then comOb(p3) = comOb(p3) + 1 Else comOb.Add p3, 1
                    If Not valOb.Exists(p3) Then valOb.Add p3, 0#
                End If
            End If
        Next r
    End If

    ' ---------------- score + ordenacao ----------------
    Dim nOb As Long : nOb = valOb.Count
    Dim ks() As String, sc() As Double
    Dim k As Variant, ix As Long

    If nOb > 0 Then
        ReDim ks(0 To nOb - 1) : ReDim sc(0 To nOb - 1)
        ix = 0
        For Each k In valOb.Keys
            Dim s As Double : s = 0
            If repOb.Exists(k) Then If repOb(k) Then s = s + PESO_REPROV
            Dim pAl As Double : pAl = 0
            If alOb.Exists(k) Then pAl = alOb(k) * PESO_ALERTA
            If pAl > CAP_ALERTA Then pAl = CAP_ALERTA
            Dim pPu As Double : pPu = 0
            If puOb.Exists(k) Then pPu = puOb(k) * PESO_PU
            If pPu > CAP_PU Then pPu = CAP_PU
            Dim pCo As Double : pCo = 0
            If comOb.Exists(k) Then pCo = comOb(k) * PESO_COM
            If pCo > CAP_COM Then pCo = CAP_COM
            s = s + pAl + pPu + pCo
            If s > 100 Then s = 100
            ks(ix) = CStr(k) : sc(ix) = s : ix = ix + 1
        Next k

        ' ordena por score desc; empate -> maior valor de obra primeiro
        Dim a As Long, b As Long, tS As String, tV As Double
        For a = 0 To nOb - 2
            For b = 0 To nOb - a - 2
                Dim troca As Boolean : troca = False
                If sc(b) < sc(b + 1) Then
                    troca = True
                ElseIf sc(b) = sc(b + 1) Then
                    If valOb(ks(b)) < valOb(ks(b + 1)) Then troca = True
                End If
                If troca Then
                    tV = sc(b) : sc(b) = sc(b + 1) : sc(b + 1) = tV
                    tS = ks(b) : ks(b) = ks(b + 1) : ks(b + 1) = tS
                End If
            Next b
        Next a
    End If

    ' ---------------- saida ----------------
    With ws.Range("A1:K2")
        .Merge
        .Value = "RANKING DE RISCO POR OBRA  -  por onde comecar a auditoria"
        .Font.Name = "Segoe UI Semibold" : .Font.Size = 16 : .Font.Bold = True
        .Font.Color = RGB(255, 255, 255) : .Interior.Color = RGB(17, 24, 39)
        .HorizontalAlignment = xlCenter : .VerticalAlignment = xlCenter
    End With
    ws.Rows(1).RowHeight = 20 : ws.Rows(2).RowHeight = 20

    Dim hdrs As Variant
    hdrs = Array("#", "PEP3NIVEL", "VALOR OBRA", "SITUACAO", "ALERTAS", _
                 "DIVERG PRECO", "SOBREPRECO R$", "COM FORA NT.006", "SCORE", "RISCO", "DIAGNOSTICO")
    Dim c As Long
    For c = 1 To 11
        With ws.Cells(3, c)
            .Value = hdrs(c - 1)
            .Font.Name = "Segoe UI Semibold" : .Font.Bold = True : .Font.Size = 10
            .Font.Color = RGB(235, 240, 248) : .Interior.Color = RGB(31, 41, 59)
            .HorizontalAlignment = xlCenter : .VerticalAlignment = xlCenter
            .Borders.LineStyle = xlContinuous : .Borders.Color = RGB(60, 70, 90)
        End With
    Next c
    ws.Rows(3).RowHeight = 26

    Dim outRow As Long : outRow = 4
    If nOb = 0 Then
        ws.Cells(4, 1).Value = "Nenhuma obra encontrada na base."
        ws.Cells(4, 1).Font.Italic = True
    Else
        ' Saida bufferizada: monta as linhas em array e escreve UMA vez
        Dim outA() As Variant : ReDim outA(1 To nOb, 1 To 11)
        Dim rkArr() As String : ReDim rkArr(1 To nOb)
        For ix = 0 To nOb - 1
            p3 = ks(ix)
            Dim nAl As Long : nAl = 0 : If alOb.Exists(p3) Then nAl = alOb(p3)
            Dim nPu As Long : nPu = 0 : If puOb.Exists(p3) Then nPu = puOb(p3)
            Dim nCo As Long : nCo = 0 : If comOb.Exists(p3) Then nCo = comOb(p3)
            Dim vSo As Double : vSo = 0 : If sobOb.Exists(p3) Then vSo = sobOb(p3)
            Dim ehRep As Boolean : ehRep = False
            If repOb.Exists(p3) Then ehRep = CBool(repOb(p3))

            Dim risco As String
            If sc(ix) >= 60 Then
                risco = "ALTO"
            ElseIf sc(ix) >= 30 Then
                risco = "MEDIO"
            ElseIf sc(ix) > 0 Then
                risco = "BAIXO"
            Else
                risco = "OK"
            End If

            ' diagnostico em linguagem clara
            Dim diag As String : diag = ""
            If ehRep Then diag = "REPROVADO na analise SAP x PRJ"
            If nAl > 0 Then diag = diag & IIf(diag <> "", " | ", "") & nAl & " alerta(s) critico(s)"
            If nPu > 0 Then
                diag = diag & IIf(diag <> "", " | ", "") & nPu & " diverg. de preco"
                If vSo > 0 Then diag = diag & " (sobrepreco " & FmtKPI(vSo) & ")"
            End If
            If nCo > 0 Then diag = diag & IIf(diag <> "", " | ", "") & nCo & " COM fora do previsto"
            If diag = "" Then diag = "Sem apontamentos"

            outA(ix + 1, 1) = ix + 1
            outA(ix + 1, 2) = p3
            outA(ix + 1, 3) = valOb(p3)
            outA(ix + 1, 4) = IIf(ehRep, "REPROVADO", "APROVADO")
            outA(ix + 1, 5) = nAl
            outA(ix + 1, 6) = nPu
            outA(ix + 1, 7) = vSo
            outA(ix + 1, 8) = nCo
            outA(ix + 1, 9) = sc(ix)
            outA(ix + 1, 10) = risco
            outA(ix + 1, 11) = diag
            rkArr(ix + 1) = risco
            outRow = outRow + 1
        Next ix
        ' escreve tudo de uma vez
        ws.Range(ws.Cells(4, 1), ws.Cells(3 + nOb, 11)).Value = outA
    End If

    ' ---------------- formatacao ----------------
    Dim wds As Variant : wds = Array(5, 26, 14, 13, 9, 13, 14, 15, 8, 9, 70)
    For c = 1 To 11 : ws.Columns(c).ColumnWidth = wds(c - 1) : Next c

    ' Formatacao em LOTE: base numa chamada so; cores por BLOCOS de risco
    ' (a lista ja vem ordenada por score, entao os niveis formam blocos contiguos)
    If nOb > 0 Then
        With ws.Range(ws.Cells(4, 1), ws.Cells(3 + nOb, 11))
            .Font.Name = "Segoe UI" : .Font.Size = 9 : .Font.Color = RGB(45, 52, 64)
            .VerticalAlignment = xlCenter
            .Borders(xlInsideHorizontal).LineStyle = xlContinuous
            .Borders(xlInsideHorizontal).Color = RGB(255, 255, 255)
            .Borders(xlEdgeBottom).LineStyle = xlContinuous
            .Borders(xlEdgeBottom).Color = RGB(255, 255, 255)
        End With
        ws.Range(ws.Cells(4, 1), ws.Cells(3 + nOb, 1)).HorizontalAlignment = xlCenter
        ws.Range(ws.Cells(4, 4), ws.Cells(3 + nOb, 6)).HorizontalAlignment = xlCenter
        ws.Range(ws.Cells(4, 8), ws.Cells(3 + nOb, 10)).HorizontalAlignment = xlCenter
        ws.Range(ws.Cells(4, 9), ws.Cells(3 + nOb, 9)).Font.Bold = True
        ws.Range(ws.Cells(4, 3), ws.Cells(3 + nOb, 3)).NumberFormat = "#,##0.00"
        ws.Range(ws.Cells(4, 7), ws.Cells(3 + nOb, 7)).NumberFormat = "#,##0.00"

        Dim rr As Long, rIni As Long, rsk As String, bg As Long, chip As Long
        rr = 1
        Do While rr <= nOb
            rsk = rkArr(rr) : rIni = rr
            Do While rr < nOb
                If rkArr(rr + 1) <> rsk Then Exit Do
                rr = rr + 1
            Loop
            Select Case rsk
                Case "ALTO":  bg = RGB(252, 226, 228) : chip = RGB(192, 0, 0)
                Case "MEDIO": bg = RGB(255, 244, 214) : chip = RGB(176, 124, 0)
                Case "BAIXO": bg = RGB(234, 242, 250) : chip = RGB(31, 78, 121)
                Case Else:    bg = RGB(231, 244, 234) : chip = RGB(33, 130, 70)
            End Select
            ws.Range(ws.Cells(3 + rIni, 1), ws.Cells(3 + rr, 11)).Interior.Color = bg
            With ws.Range(ws.Cells(3 + rIni, 10), ws.Cells(3 + rr, 10))
                .Interior.Color = chip : .Font.Color = RGB(255, 255, 255) : .Font.Bold = True
            End With
            ws.Range(ws.Cells(3 + rIni, 9), ws.Cells(3 + rr, 9)).Font.Color = chip
            rr = rr + 1
        Loop

        ' destaque de SITUACAO reprovada (poucas obras - pode ser por linha)
        For rr = 1 To nOb
            If CStr(outA(rr, 4)) = "REPROVADO" Then
                With ws.Cells(3 + rr, 4)
                    .Font.Color = RGB(192, 0, 0) : .Font.Bold = True
                End With
            End If
        Next rr
    End If

    If outRow > 4 Then ws.Range(ws.Cells(3, 1), ws.Cells(3, 11)).AutoFilter

    On Error Resume Next
    ws.Activate
    ActiveWindow.DisplayGridlines = False
    ws.Range("A4").Select
    ActiveWindow.FreezePanes = True
    On Error GoTo 0
    ws.Range("A1").Select
End Sub


' ===========================================================================
'  DESIGN GLOBAL - identidade visual unificada, aplicada APOS a geracao
'  (por isso nao interfere nas leituras entre abas, que usam o layout bruto):
'    1. Cor da guia (Tab) por aba - paleta propria de cada relatorio
'    2. Barra de navegacao clicavel no topo de TODAS as abas
'    3. Contadores dinamicos nos titulos (apontamentos, obras, divergencias)
'    4. PRECO UNITARIO ganha banda de titulo (nao tinha)
'    5. Drill-down: cards do PAINEL viram atalhos para a aba de origem
' ===========================================================================
Private Function CorAcento(nome As String) As Long
    Select Case nome
        Case "PAINEL DO GESTOR":   CorAcento = RGB(17, 24, 39)     ' navy
        Case "ANALISE SAP x PRJ":  CorAcento = RGB(31, 78, 121)    ' azul
        Case "RACIONALIZACAO COM": CorAcento = RGB(94, 84, 158)    ' indigo
        Case "PRECO UNITARIO":     CorAcento = RGB(21, 96, 130)    ' petroleo
        Case "ALERTA CRITICO":     CorAcento = RGB(176, 0, 0)      ' vermelho
        Case "RANKING DE RISCO":   CorAcento = RGB(176, 124, 0)    ' ambar
        Case Else:                 CorAcento = RGB(90, 98, 110)
    End Select
End Function

' Barra de navegacao com BOTOES (Shapes) inserida na LINHA 1 da aba.
' Shapes tem largura uniforme, independente da largura das colunas de dados.
Private Sub InserirBarraNav(ws As Worksheet, nomes As Variant, rots As Variant, _
                            atual As String, congRow As Long)
    ws.Activate
    On Error Resume Next
    ActiveWindow.FreezePanes = False
    On Error GoTo 0
    ws.Rows(1).Insert
    ws.Rows(1).Clear
    ws.Rows(1).RowHeight = 32
    ws.Rows(1).Interior.Color = RGB(246, 247, 249)
    Dim j As Long, x As Double
    x = 6
    For j = 0 To UBound(nomes)
        BotaoNav ws, x, CStr(nomes(j)), CStr(rots(j)), (CStr(nomes(j)) = atual)
        x = x + 116
    Next j
    ' refaz o congelamento, que desceu 1 linha junto com o conteudo
    If congRow > 0 Then
        On Error Resume Next
        ws.Cells(congRow, 1).Select
        ActiveWindow.FreezePanes = True
        On Error GoTo 0
    End If
    ws.Range("A1").Select
End Sub

' Um botao da barra: retangulo arredondado clicavel na cor da aba destino.
' O botao da propria aba aparece cinza com a marca de "voce esta aqui".
Private Sub BotaoNav(ws As Worksheet, x As Double, destino As String, _
                     rotulo As String, ehAtual As Boolean)
    Dim shp As Shape
    Set shp = ws.Shapes.AddShape(msoShapeRoundedRectangle, x, 4, 110, 24)
    With shp
        .Line.Visible = msoFalse
        If ehAtual Then
            .Fill.ForeColor.RGB = RGB(225, 228, 233)
        Else
            .Fill.ForeColor.RGB = CorAcento(destino)
        End If
        With .TextFrame2
            .WordWrap = msoFalse
            .MarginLeft = 0 : .MarginRight = 0 : .MarginTop = 0 : .MarginBottom = 0
            .VerticalAnchor = msoAnchorMiddle
            .TextRange.Text = IIf(ehAtual, ChrW(9679) & " " & rotulo, rotulo)
            .TextRange.ParagraphFormat.Alignment = msoAlignCenter
            With .TextRange.Font
                .Size = 9 : .Bold = msoTrue : .Name = "Segoe UI"
                .Fill.ForeColor.RGB = IIf(ehAtual, RGB(80, 88, 100), RGB(255, 255, 255))
            End With
        End With
        .Placement = xlFreeFloating
    End With
    If Not ehAtual Then
        ws.Hyperlinks.Add Anchor:=shp, Address:="", _
            SubAddress:="'" & destino & "'!A1", ScreenTip:="Abrir " & destino
    End If
End Sub

' Acrescenta " - N <sufixo>" ao titulo (A1) de uma aba, ignorando a linha
' informativa "Nenhum..." das abas vazias.
Private Sub AppendContagem(wb As Workbook, aba As String, _
                           primeiraLinhaDados As Long, sufixo As String)
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = wb.Worksheets(aba)
    On Error GoTo 0
    If ws Is Nothing Then Exit Sub
    Dim lastR As Long : lastR = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row
    Dim n As Long : n = lastR - primeiraLinhaDados + 1
    If n < 0 Then n = 0
    If n = 1 Then
        If InStr(UCase(CStr(ws.Cells(primeiraLinhaDados, 1).Value)), "NENHUM") > 0 Then n = 0
    End If
    ws.Range("A1").Value = ws.Range("A1").Value & "  -  " & Format(n, "#,##0") & sufixo
End Sub

' Transforma o rotulo de um card do PAINEL em atalho para a aba de origem.
Private Sub LinkCard(ws As Worksheet, topRow As Long, leftCol As Long, destino As String)
    Dim cel As Range : Set cel = ws.Cells(topRow, leftCol)
    Dim corLbl As Long : corLbl = cel.Font.Color
    Dim txt As String : txt = CStr(cel.Value)
    On Error Resume Next
    ws.Hyperlinks.Add Anchor:=cel, Address:="", _
        SubAddress:="'" & destino & "'!A1", ScreenTip:="Abrir " & destino
    On Error GoTo 0
    With cel
        .Value = txt & "  " & ChrW(8594)   ' seta indica que o card e clicavel
        .Font.Name = "Segoe UI" : .Font.Size = 9 : .Font.Bold = True
        .Font.Color = corLbl : .Font.Underline = False
        .HorizontalAlignment = xlCenter : .VerticalAlignment = xlCenter
    End With
End Sub

Private Sub AplicarDesignGlobal(wb As Workbook)
    Dim nomes As Variant, rots As Variant
    nomes = Array("PAINEL DO GESTOR", "ANALISE SAP x PRJ", "RACIONALIZACAO COM", _
                  "PRECO UNITARIO", "ALERTA CRITICO", "RANKING DE RISCO")
    rots = Array("PAINEL", "ANALISE", "RACIONALIZACAO", "PRECOS", "ALERTAS", "RANKING")

    Dim ws As Worksheet, r As Long, i As Long, j As Long

    ' ---- 1) PRECO UNITARIO ganha banda de titulo com contadores ----
    Set ws = Nothing
    On Error Resume Next
    Set ws = wb.Worksheets("PRECO UNITARIO")
    On Error GoTo 0
    If Not ws Is Nothing Then
        ws.Activate
        On Error Resume Next
        ActiveWindow.FreezePanes = False
        On Error GoTo 0
        ws.Rows("1:2").Insert
        Dim lastP As Long : lastP = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row
        Dim nIt As Long, nDv As Long
        If lastP >= 4 Then
            Dim dP As Variant : dP = ws.Range(ws.Cells(4, 1), ws.Cells(lastP, 12)).Value
            For r = 1 To UBound(dP, 1)
                nIt = nIt + 1
                Dim stP As String : stP = UCase(Trim(CStr(dP(r, 12))))
                If stP = "ABAIXO DO MINIMO" Or stP = "ACIMA DO MAXIMO" Then nDv = nDv + 1
            Next r
        End If
        With ws.Range("A1:N2")
            .Merge
            .Value = "PRECO UNITARIO  -  " & Format(nIt, "#,##0") & " itens  |  " & _
                     Format(nDv, "#,##0") & " divergencia(s) de faixa"
            .Font.Name = "Segoe UI Semibold" : .Font.Size = 13 : .Font.Bold = True
            .Font.Color = RGB(235, 240, 248) : .Interior.Color = RGB(17, 24, 39)
            .HorizontalAlignment = xlCenter : .VerticalAlignment = xlCenter
        End With
        ws.Rows(1).RowHeight = 20 : ws.Rows(2).RowHeight = 20
        On Error Resume Next
        ws.Range("A4").Select
        ActiveWindow.FreezePanes = True
        On Error GoTo 0
        ws.Range("A1").Select
    End If

    ' ---- 2) contadores dinamicos nos titulos ----
    AppendContagem wb, "ALERTA CRITICO", 4, " apontamento(s)"
    AppendContagem wb, "RANKING DE RISCO", 4, " obra(s)"

    Set ws = Nothing
    On Error Resume Next
    Set ws = wb.Worksheets("RACIONALIZACAO COM")
    On Error GoTo 0
    If Not ws Is Nothing Then
        Dim lastC As Long : lastC = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row
        Dim nFora As Long : nFora = 0
        If lastC >= 3 Then
            Dim dC As Variant : dC = ws.Range(ws.Cells(3, 1), ws.Cells(lastC, 9)).Value
            For r = 1 To UBound(dC, 1)
                Select Case UCase(Trim(CStr(dC(r, 9))))
                    Case "FALTANDO", "EXCESSO", "EXAGERADO", "ZERO" : nFora = nFora + 1
                End Select
            Next r
        End If
        ws.Range("A1").Value = ws.Range("A1").Value & "  -  " & _
                               Format(nFora, "#,##0") & " fora do previsto"
    End If

    ' ---- 3) cor da guia de cada aba ----
    For i = 0 To UBound(nomes)
        Set ws = Nothing
        On Error Resume Next
        Set ws = wb.Worksheets(CStr(nomes(i)))
        On Error GoTo 0
        If Not ws Is Nothing Then ws.Tab.Color = CorAcento(CStr(nomes(i)))
    Next i

    ' ---- 4) drill-down: cards do PAINEL viram atalhos ----
    Set ws = Nothing
    On Error Resume Next
    Set ws = wb.Worksheets("PAINEL DO GESTOR")
    On Error GoTo 0
    If Not ws Is Nothing Then
        LinkCard ws, 4, 1, "RANKING DE RISCO"     ' Valor total -> visao por obra
        LinkCard ws, 4, 3, "ANALISE SAP x PRJ"    ' PEPs analisados
        LinkCard ws, 4, 5, "ANALISE SAP x PRJ"    ' PEPs aprovados
        LinkCard ws, 4, 7, "ANALISE SAP x PRJ"    ' PEPs reprovados
        LinkCard ws, 8, 1, "ALERTA CRITICO"       ' Alertas criticos
        LinkCard ws, 8, 3, "PRECO UNITARIO"       ' Divergencias de preco
        LinkCard ws, 8, 5, "PRECO UNITARIO"       ' Sobrepreco potencial
        LinkCard ws, 8, 7, "RANKING DE RISCO"     ' Valor em risco
    End If

    ' ---- 5) barra de navegacao no TOPO (linha 1) de cada aba ----
    ' Roda por ULTIMO: o conteudo desce 1 linha e o congelamento e refeito.
    For i = 0 To UBound(nomes)
        Set ws = Nothing
        On Error Resume Next
        Set ws = wb.Worksheets(CStr(nomes(i)))
        On Error GoTo 0
        If Not ws Is Nothing Then
            Dim congRow As Long
            Select Case CStr(nomes(i))
                Case "PAINEL DO GESTOR":   congRow = 0    ' sem congelamento
                Case "ANALISE SAP x PRJ":  congRow = 11   ' dados comecam na 11
                Case "RACIONALIZACAO COM": congRow = 4
                Case Else:                 congRow = 5    ' PRECOS, ALERTAS, RANKING
            End Select
            InserirBarraNav ws, nomes, rots, CStr(nomes(i)), congRow
        End If
    Next i
End Sub

' Localiza a aba base pelas colunas MAT LIB SAP / MAT PRJ CAD
Private Function AcharBaseInventario(wb As Workbook) As Worksheet

    Dim ws      As Worksheet
    Dim c       As Long, lastC As Long
    Dim h       As String
    Dim hasSAP  As Boolean, hasPRJ As Boolean

    For Each ws In wb.Worksheets
        Select Case ws.Name
            Case "PAINEL DO GESTOR", "ANALISE SAP x PRJ", "RESUMO SAP x PRJ", "RACIONALIZACAO COM", "ALERTA CRITICO", "PRECO UNITARIO", "RANKING DE RISCO", "CONFIG", "HISTORICO", "LOG EXECUCAO", "TESTES"
                ' aba de saida / apoio - ignora
            Case Else
                If ws.UsedRange.Rows.Count > 1 Then
                    hasSAP = False : hasPRJ = False
                    lastC = ws.Cells(1, ws.Columns.Count).End(xlToLeft).Column
                    For c = 1 To lastC
                        h = NormStr(CStr(ws.Cells(1, c).Value))
                        If h = "MAT LIB SAP" Then hasSAP = True
                        If h = "MAT PRJ CAD" Then hasPRJ = True
                    Next c
                    If hasSAP And hasPRJ Then
                        Set AcharBaseInventario = ws
                        Exit Function
                    End If
                End If
        End Select
    Next ws

    Set AcharBaseInventario = Nothing
End Function

' ===========================================================================
'  PAINEL DO GESTOR: visao executiva com KPIs em cartoes + ranking de alertas
'  Le os resultados ja gerados (ANALISE SAP x PRJ, PRECO UNITARIO, ALERTA CRITICO)
' ===========================================================================
Private Function ProcessarPainelGestor(wb As Workbook, wsBase As Worksheet, _
        wsDet As Worksheet, wsPU As Worksheet, wsAlertaC As Worksheet) As Worksheet

    Dim ws As Worksheet
    Set ws = wb.Worksheets.Add(Before:=wb.Worksheets(1))
    ws.Name = "PAINEL DO GESTOR"

    ' ---------------- COLETA DE KPIs ----------------
    Dim valTot As Double, valRisk As Double
    Dim nPep3 As Long, nReprov As Long, nAprov As Long
    Dim nAlertas As Long, nDiverg As Long, sobrepreco As Double

    ' PEPs + valor + reprovacao (le ANALISE SAP x PRJ, dados a partir da linha 10)
    Dim pep3St As Object : Set pep3St = CreateObject("Scripting.Dictionary")  ' pep3 -> reprovado?
    Dim lastD As Long : lastD = wsDet.Cells(wsDet.Rows.Count, 1).End(xlUp).Row
    If lastD >= 10 Then
        Dim dd As Variant : dd = wsDet.Range(wsDet.Cells(10, 1), wsDet.Cells(lastD, 15)).Value
        Dim r As Long
        For r = 1 To UBound(dd, 1)
            Dim p3 As String : p3 = Trim(CStr(dd(r, 1)))
            Dim vlr As Double : vlr = Val0(dd(r, 6))
            Dim apv As String : apv = UCase(CStr(dd(r, 14)))
            Dim isRep As Boolean : isRep = (InStr(apv, "REPROVADO") > 0)
            valTot = valTot + vlr
            If isRep Then valRisk = valRisk + Abs(vlr)
            If p3 <> "" Then
                If Not pep3St.Exists(p3) Then
                    pep3St.Add p3, isRep
                ElseIf isRep Then
                    pep3St(p3) = True
                End If
            End If
        Next r
    End If
    nPep3 = pep3St.Count
    Dim k As Variant
    For Each k In pep3St.Keys
        If pep3St(k) Then nReprov = nReprov + 1
    Next k
    nAprov = nPep3 - nReprov

    ' Alertas criticos (le ALERTA CRITICO, dados a partir da linha 4) + ranking por tipo
    Dim tipos As Object : Set tipos = CreateObject("Scripting.Dictionary")
    Dim lastA As Long : lastA = wsAlertaC.Cells(wsAlertaC.Rows.Count, 1).End(xlUp).Row
    If lastA >= 4 Then
        Dim aa As Variant : aa = wsAlertaC.Range(wsAlertaC.Cells(4, 1), wsAlertaC.Cells(lastA, 2)).Value
        For r = 1 To UBound(aa, 1)
            Dim tA As String : tA = Trim(CStr(aa(r, 1)))
            ' ignora a linha informativa "Nenhum alerta..." da aba sem apontamentos
            If tA <> "" And InStr(UCase(tA), "NENHUM ALERTA") = 0 Then
                nAlertas = nAlertas + 1
                If tipos.Exists(tA) Then tipos(tA) = tipos(tA) + 1 Else tipos.Add tA, 1
            End If
        Next r
    End If

    ' Divergencias de preco + sobrepreco potencial (le PRECO UNITARIO, dados linha 2+)
    Dim lastP As Long : lastP = wsPU.Cells(wsPU.Rows.Count, 1).End(xlUp).Row
    If lastP >= 2 Then
        Dim pp As Variant : pp = wsPU.Range(wsPU.Cells(2, 1), wsPU.Cells(lastP, 13)).Value
        For r = 1 To UBound(pp, 1)
            Dim stP As String : stP = UCase(Trim(CStr(pp(r, 12))))
            If stP = "ABAIXO DO MINIMO" Or stP = "ACIMA DO MAXIMO" Then nDiverg = nDiverg + 1
            If stP = "ACIMA DO MAXIMO" Then
                Dim qq As Double : qq = Val0(pp(r, 7))
                Dim puu As Double : puu = Val0(pp(r, 9))
                Dim mxx As Double : mxx = Val0(pp(r, 11))
                If puu > mxx And qq > 0 Then sobrepreco = sobrepreco + (puu - mxx) * qq
            End If
        Next r
    End If

    Dim pctAprov As Double
    If nPep3 > 0 Then pctAprov = nAprov / nPep3 * 100

    ' ---------------- LAYOUT ----------------
    ws.Cells.Interior.Color = RGB(248, 249, 251)
    Dim cc As Long
    For cc = 1 To 8 : ws.Columns(cc).ColumnWidth = 16.5 : Next cc

    ' Titulo
    With ws.Range("A1:H1")
        .Merge : .Value = "PAINEL DO GESTOR"
        .Font.Name = "Segoe UI" : .Font.Size = 24 : .Font.Bold = True
        .Font.Color = RGB(255, 255, 255) : .Interior.Color = RGB(17, 24, 39)
        .HorizontalAlignment = xlCenter : .VerticalAlignment = xlCenter
    End With
    ws.Rows(1).RowHeight = 42
    With ws.Range("A2:H2")
        .Merge
        .Value = "Analise de Inventario  -  Base: " & wsBase.Name & "   |   Gerado em " & Format(Now, "dd/mm/yyyy hh:mm")
        .Font.Name = "Segoe UI" : .Font.Size = 10 : .Font.Color = RGB(120, 128, 140)
        .Interior.Color = RGB(31, 41, 59) : .Font.Color = RGB(200, 208, 220)
        .HorizontalAlignment = xlCenter : .VerticalAlignment = xlCenter
    End With
    ws.Rows(2).RowHeight = 20

    ' --- KPI cards (linha 1 de cards: 4) ---
    CardGestor ws, 4, 1, "Valor total da obra", FmtKPI(valTot), RGB(255, 255, 255), RGB(17, 24, 39)
    CardGestor ws, 4, 3, "PEPs analisados", Format(nPep3, "#,##0"), RGB(255, 255, 255), RGB(17, 24, 39)
    CardGestor ws, 4, 5, "PEPs aprovados", Format(nAprov, "#,##0") & "  (" & Format(pctAprov, "0") & "%)", RGB(231, 247, 237), RGB(21, 115, 71)
    CardGestor ws, 4, 7, "PEPs reprovados", Format(nReprov, "#,##0"), RGB(252, 232, 233), RGB(192, 0, 0)
    ' --- KPI cards (linha 2 de cards: 4) ---
    CardGestor ws, 8, 1, "Alertas criticos", Format(nAlertas, "#,##0"), RGB(255, 248, 230), RGB(176, 124, 0)
    CardGestor ws, 8, 3, "Divergencias de preco", Format(nDiverg, "#,##0"), RGB(234, 242, 250), RGB(31, 78, 121)
    CardGestor ws, 8, 5, "Sobrepreco potencial", FmtKPI(sobrepreco), RGB(252, 232, 233), RGB(192, 0, 0)
    CardGestor ws, 8, 7, "Valor em risco (reprov.)", FmtKPI(valRisk), RGB(252, 232, 233), RGB(192, 0, 0)

    ' --- Ranking de alertas por tipo (com mini-barras) ---
    Dim secRow As Long : secRow = 13
    With ws.Range(ws.Cells(secRow, 1), ws.Cells(secRow, 8))
        .Merge : .Value = "ALERTAS CRITICOS POR TIPO"
        .Font.Name = "Segoe UI" : .Font.Size = 12 : .Font.Bold = True
        .Font.Color = RGB(255, 255, 255) : .Interior.Color = RGB(31, 41, 59)
        .HorizontalAlignment = xlLeft : .VerticalAlignment = xlCenter
        .IndentLevel = 1
    End With
    ws.Rows(secRow).RowHeight = 26

    ' ordena tipos por contagem desc
    Dim nT As Long : nT = tipos.Count
    Dim hr As Long : hr = secRow + 1
    If nT = 0 Then
        With ws.Range(ws.Cells(hr, 1), ws.Cells(hr, 8))
            .Merge : .Value = "Nenhum alerta critico encontrado. Parabens!"
            .Font.Name = "Segoe UI" : .Font.Size = 11 : .Font.Italic = True
            .Font.Color = RGB(21, 115, 71)
            .HorizontalAlignment = xlCenter
        End With
        ws.Rows(hr).RowHeight = 24
    Else
        Dim ks() As String, vs() As Long
        ReDim ks(0 To nT - 1) : ReDim vs(0 To nT - 1)
        Dim ix As Long : ix = 0
        For Each k In tipos.Keys
            ks(ix) = CStr(k) : vs(ix) = tipos(k) : ix = ix + 1
        Next k
        Dim a As Long, b As Long, tS As String, tV As Long
        For a = 0 To nT - 2
            For b = 0 To nT - a - 2
                If vs(b) < vs(b + 1) Then
                    tV = vs(b) : vs(b) = vs(b + 1) : vs(b + 1) = tV
                    tS = ks(b) : ks(b) = ks(b + 1) : ks(b + 1) = tS
                End If
            Next b
        Next a
        Dim maxV As Long : maxV = vs(0) : If maxV < 1 Then maxV = 1

        ' cabecalho da mini-tabela
        ws.Cells(hr, 1).Value = "TIPO DE ALERTA"
        ws.Cells(hr, 4).Value = "QTD"
        ws.Cells(hr, 5).Value = "PARTICIPACAO"
        Dim hc As Long
        For hc = 1 To 8
            With ws.Cells(hr, hc)
                .Font.Name = "Segoe UI" : .Font.Bold = True : .Font.Size = 9
                .Font.Color = RGB(120, 128, 140)
            End With
        Next hc
        ws.Range(ws.Cells(hr, 1), ws.Cells(hr, 3)).Merge
        ws.Range(ws.Cells(hr, 5), ws.Cells(hr, 8)).Merge

        Dim rr As Long : rr = hr + 1
        For a = 0 To nT - 1
            With ws.Range(ws.Cells(rr, 1), ws.Cells(rr, 3))
                .Merge : .Value = ks(a)
                .Font.Name = "Segoe UI" : .Font.Size = 10 : .Font.Color = RGB(40, 46, 56)
                .HorizontalAlignment = xlLeft : .IndentLevel = 1
            End With
            With ws.Cells(rr, 4)
                .Value = vs(a)
                .Font.Name = "Segoe UI" : .Font.Size = 11 : .Font.Bold = True
                .Font.Color = RGB(17, 24, 39) : .HorizontalAlignment = xlCenter
            End With
            Dim nB As Long : nB = Int(vs(a) / maxV * 24) : If nB < 1 Then nB = 1
            With ws.Range(ws.Cells(rr, 5), ws.Cells(rr, 8))
                .Merge : .Value = String(nB, ChrW(9608)) & "  " & Format(vs(a) / nAlertas, "0%")
                .Font.Name = "Consolas" : .Font.Size = 10 : .Font.Color = RGB(214, 89, 17)
                .HorizontalAlignment = xlLeft
            End With
            If a Mod 2 = 1 Then
                ws.Range(ws.Cells(rr, 1), ws.Cells(rr, 8)).Interior.Color = RGB(255, 255, 255)
            End If
            ws.Rows(rr).RowHeight = 20
            rr = rr + 1
        Next a
    End If

    ' Aparencia geral
    On Error Resume Next
    ws.Activate
    ActiveWindow.DisplayGridlines = False
    ws.Range("A1").Select
    On Error GoTo 0
    ws.Tab.Color = RGB(17, 24, 39)

    Set ProcessarPainelGestor = ws
End Function

' Desenha um cartao de KPI ocupando 2 colunas x 3 linhas (label + valor grande)
Private Sub CardGestor(ws As Worksheet, ByVal topRow As Long, ByVal leftCol As Long, _
        titulo As String, valor As String, corFundo As Long, corValor As Long)
    With ws.Range(ws.Cells(topRow, leftCol), ws.Cells(topRow + 2, leftCol + 1))
        .Interior.Color = corFundo
        .Borders.LineStyle = xlContinuous : .Borders.Color = RGB(222, 226, 232)
    End With
    With ws.Range(ws.Cells(topRow, leftCol), ws.Cells(topRow, leftCol + 1))
        .Merge : .Value = UCase(titulo)
        .Font.Name = "Segoe UI" : .Font.Size = 9 : .Font.Bold = True
        .Font.Color = RGB(110, 118, 130)
        .HorizontalAlignment = xlCenter : .VerticalAlignment = xlCenter
    End With
    With ws.Range(ws.Cells(topRow + 1, leftCol), ws.Cells(topRow + 2, leftCol + 1))
        .Merge : .Value = valor
        .Font.Name = "Segoe UI" : .Font.Size = 19 : .Font.Bold = True
        .Font.Color = corValor
        .HorizontalAlignment = xlCenter : .VerticalAlignment = xlCenter
    End With
    ws.Rows(topRow).RowHeight = 18
    ws.Rows(topRow + 1).RowHeight = 22
    ws.Rows(topRow + 2).RowHeight = 18
End Sub

' ===========================================================================
'  MELHORIAS: CONFIG, LOG, VALIDACAO, RESUMO PEP3, DEVOLUCOES, HISTORICO,
'  TESTES DE LOGICA e NOMES/TABELA ESTRUTURADA
' ===========================================================================

' Registra o resultado de uma etapa no log; erro nao aborta o processo (erro granular).
Private Sub FimEtapa(erroNum As Long, erroDesc As String, etapa As String, t0 As Double)
    If erroNum <> 0 Then
        mFalhas = mFalhas & vbCrLf & "  - " & etapa & ": " & erroDesc
        LogAdd "FALHA [" & etapa & "]: (" & erroNum & ") " & erroDesc
    Else
        LogAdd etapa & " OK (" & Format(Timer - t0, "0.0") & "s)"
    End If
End Sub

' --------- CONFIG editavel (parametros centralizados na aba CONFIG) ---------
Private Sub GarantirConfig(wb As Workbook)
    Set mCfg = CreateObject("Scripting.Dictionary")
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = wb.Worksheets("CONFIG")
    On Error GoTo 0
    If ws Is Nothing Then
        Set ws = wb.Worksheets.Add(After:=wb.Worksheets(wb.Worksheets.Count))
        ws.Name = "CONFIG"
        ws.Cells(1, 1).Value = "CHAVE"
        ws.Cells(1, 2).Value = "VALOR"
        ws.Cells(1, 3).Value = "DESCRICAO"
        Dim df As Variant
        df = Array( _
            Array("TOL_ADERENCIA_PCT", 0.1, "Tolerancia de aderencia SAP x PRJ (fracao; 0,1 = 10%)"), _
            Array("TOL_SUBVAL", 0.9, "UC subvalorizado: alerta se PU menor que fator x referencia"), _
            Array("MIN_DIVERG_RS", 100, "Materialidade minima da divergencia em R$ p/ alertar"), _
            Array("CABO_ISOLADO_MAX_M", 15, "Cabo isolado abaixo deste comprimento (m) fica isento de UC"), _
            Array("CORTE_DIVERG_QTD", 20, "Destaca linhas com diferenca de qtd acima deste valor"), _
            Array("PESO_REPROV", 40, "Ranking: peso de obra reprovada na SAP x PRJ"), _
            Array("PESO_ALERTA", 4, "Ranking: peso por alerta critico"), _
            Array("CAP_ALERTA", 24, "Ranking: teto da parcela de alertas"), _
            Array("PESO_PU", 3, "Ranking: peso por divergencia de preco unitario"), _
            Array("CAP_PU", 18, "Ranking: teto da parcela de PU"), _
            Array("PESO_COM", 2, "Ranking: peso por COM fora do previsto NT.006"), _
            Array("CAP_COM", 18, "Ranking: teto da parcela de COM"), _
            Array("COM_CRITICO", "CH FUS; PARA RAIO", "Familias COM criticas (separadas por ;) que reprovam o PEP3") _
        )
        Dim j As Long
        For j = 0 To UBound(df)
            ws.Cells(2 + j, 1).Value = df(j)(0)
            ws.Cells(2 + j, 2).Value = df(j)(1)
            ws.Cells(2 + j, 3).Value = df(j)(2)
        Next j
        With ws.Range("A1:C1")
            .Font.Bold = True : .Font.Color = RGB(255, 255, 255)
            .Interior.Color = RGB(17, 24, 39) : .HorizontalAlignment = xlCenter
        End With
        ws.Columns(1).ColumnWidth = 22 : ws.Columns(2).ColumnWidth = 20 : ws.Columns(3).ColumnWidth = 62
        ws.Range(ws.Cells(2, 2), ws.Cells(2 + UBound(df), 2)).HorizontalAlignment = xlCenter
        ws.Tab.Color = RGB(90, 90, 90)
    End If

    Dim lastR As Long : lastR = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row
    Dim r As Long, chave As String
    For r = 2 To lastR
        chave = Trim(CStr(ws.Cells(r, 1).Value))
        If chave <> "" And Not mCfg.Exists(chave) Then mCfg.Add chave, CStr(ws.Cells(r, 2).Value)
    Next r

    ' valores usados em hot path (evita reparse por chamada)
    mTolAder = CfgD("TOL_ADERENCIA_PCT", 0.1)
    mCaboMax = CfgD("CABO_ISOLADO_MAX_M", 15)

    ' familias COM criticas -> tokens normalizados (UCase, sem espaco)
    Set mComCrit = CreateObject("Scripting.Dictionary")
    Dim parts() As String : parts = Split(CfgS("COM_CRITICO", "CH FUS; PARA RAIO"), ";")
    Dim tk As String
    For r = 0 To UBound(parts)
        tk = Replace(NormStr(parts(r)), " ", "")
        If tk <> "" And Not mComCrit.Exists(tk) Then mComCrit.Add tk, True
    Next r
End Sub

Private Function CfgS(chave As String, padrao As String) As String
    CfgS = padrao
    If mCfg Is Nothing Then Exit Function
    If mCfg.Exists(chave) Then
        Dim v As String : v = Trim(CStr(mCfg(chave)))
        If v <> "" Then CfgS = v
    End If
End Function

Private Function CfgD(chave As String, padrao As Double) As Double
    Dim s As String : s = CfgS(chave, "")
    If s = "" Then CfgD = padrao : Exit Function
    ' Val interpreta "." como decimal independente do locale
    CfgD = Val(Replace(s, ",", "."))
End Function

' --------- Log de execucao (aba oculta, tempo por etapa) ---------
Private Sub LogInit()
    Set mLog = New Collection
    mFalhas = "" : mT0 = Timer
    LogAdd "Inicio da execucao"
End Sub

Private Sub LogAdd(msg As String)
    If mLog Is Nothing Then Set mLog = New Collection
    mLog.Add Format(Now, "hh:nn:ss") & "  (+" & Format(Timer - mT0, "0.0") & "s)  " & msg
End Sub

Private Sub GravarLog(wb As Workbook)
    On Error Resume Next
    Dim ws As Worksheet
    Set ws = wb.Worksheets("LOG EXECUCAO")
    If ws Is Nothing Then
        Set ws = wb.Worksheets.Add(After:=wb.Worksheets(wb.Worksheets.Count))
        ws.Name = "LOG EXECUCAO"
    Else
        ws.Visible = xlSheetVisible : ws.Cells.Clear
    End If
    ws.Cells(1, 1).Value = "LOG DE EXECUCAO - " & Format(Now, "dd/mm/yyyy hh:nn")
    ws.Cells(1, 1).Font.Bold = True
    Dim i As Long
    If Not mLog Is Nothing Then
        For i = 1 To mLog.Count
            ws.Cells(1 + i, 1).Value = mLog(i)
        Next i
    End If
    ws.Columns(1).ColumnWidth = 95
    ws.Tab.Color = RGB(120, 120, 120)
    ' sai da aba LOG (recem-criada fica ativa) para poder oculta-la
    wb.Worksheets(1).Activate
    ws.Visible = xlSheetHidden
    On Error GoTo 0
End Sub

' --------- Validacao da base: lista todas as colunas obrigatorias ausentes ---------
Private Function ValidarBase(wsBase As Worksheet) As String
    Dim req As Variant
    req = Array("PEP3NIVEL", "PEP4NIVEL", "COD MAT", "VALOR", "FAMILIA", "TIPO", _
                "SIT MAT", "MAT LIB SAP", "MAT PRJ CAD")
    Dim have As Object : Set have = CreateObject("Scripting.Dictionary")
    Dim lastC As Long : lastC = wsBase.Cells(1, wsBase.Columns.Count).End(xlToLeft).Column
    Dim c As Long, h As String
    For c = 1 To lastC
        h = NormStr(CStr(wsBase.Cells(1, c).Value))
        If h <> "" And Not have.Exists(h) Then have.Add h, True
    Next c
    Dim falta As String, i As Long
    For i = 0 To UBound(req)
        If Not have.Exists(CStr(req(i))) Then falta = falta & IIf(falta <> "", ", ", "") & req(i)
    Next i
    ValidarBase = falta
End Function

' extrai o nome da familia do texto "Devolvido por divergencia de X"
Private Function MotivoFamilia(s As String) As String
    Dim pre As String : pre = "Devolvido por divergencia de "
    If Left(s, Len(pre)) = pre Then MotivoFamilia = Mid(s, Len(pre) + 1) Else MotivoFamilia = s
End Function

' --------- RESUMO por PEP3: 1 linha por obra (le a ANALISE ja gerada) ---------
Private Sub ProcessarResumoPEP3(wb As Workbook, wsDet As Worksheet)
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = wb.Worksheets("RESUMO SAP x PRJ")
    On Error GoTo 0
    If ws Is Nothing Then Set ws = wb.Worksheets.Add(After:=wsDet)
    ws.Name = "RESUMO SAP x PRJ"
    ws.Cells.Clear

    Dim hdrRow As Long, rr As Long, lastScan As Long
    lastScan = wsDet.Cells(wsDet.Rows.Count, 1).End(xlUp).Row
    For rr = 1 To lastScan
        If NormStr(CStr(wsDet.Cells(rr, 1).Value)) = "PEP3NIVEL" Then hdrRow = rr : Exit For
    Next rr
    Dim ds As Long : ds = hdrRow + 1
    Dim lastD As Long : lastD = wsDet.Cells(wsDet.Rows.Count, 1).End(xlUp).Row

    Dim sit As Object : Set sit = CreateObject("Scripting.Dictionary")
    Dim vObra As Object : Set vObra = CreateObject("Scripting.Dictionary")
    Dim vNA As Object : Set vNA = CreateObject("Scripting.Dictionary")
    Dim mot As Object : Set mot = CreateObject("Scripting.Dictionary")
    Dim ods As Object : Set ods = CreateObject("Scripting.Dictionary")

    If hdrRow > 0 And lastD >= ds Then
        Dim dd As Variant : dd = wsDet.Range(wsDet.Cells(ds, 1), wsDet.Cells(lastD, 16)).Value
        Dim i As Long, p3 As String, p4 As String, apv As String, s13 As String, m16 As String, v6 As Double
        For i = 1 To UBound(dd, 1)
            p3 = Trim(CStr(dd(i, 1)))
            If p3 <> "" Then
                If Not sit.Exists(p3) Then
                    sit.Add p3, False : vObra.Add p3, 0# : vNA.Add p3, 0# : mot.Add p3, ""
                    ods.Add p3, CreateObject("Scripting.Dictionary")
                End If
                apv = UCase(CStr(dd(i, 14)))
                If InStr(apv, "REPROVADO") > 0 Then sit(p3) = True
                v6 = Val0(dd(i, 6))
                vObra(p3) = vObra(p3) + v6
                s13 = UCase(CStr(dd(i, 13)))
                If InStr(s13, "NAO ADER") > 0 Then vNA(p3) = vNA(p3) + Abs(v6)
                m16 = Trim(CStr(dd(i, 16)))
                If m16 <> "" And mot(p3) = "" Then mot(p3) = m16
                p4 = Trim(CStr(dd(i, 2)))
                If p4 <> "" Then If Not ods(p3).Exists(p4) Then ods(p3).Add p4, True
            End If
        Next i
    End If

    With ws.Range("A1:G2")
        .Merge : .Value = "RESUMO POR OBRA (PEP3)  -  1 linha por obra"
        .Font.Name = "Segoe UI Semibold" : .Font.Size = 15 : .Font.Bold = True
        .Font.Color = RGB(255, 255, 255) : .Interior.Color = RGB(31, 78, 121)
        .HorizontalAlignment = xlCenter : .VerticalAlignment = xlCenter
    End With
    ws.Rows(1).RowHeight = 20 : ws.Rows(2).RowHeight = 20
    Dim hdrs As Variant
    hdrs = Array("PEP3NIVEL", "SITUACAO", "ODs (PEP4)", "VALOR OBRA", "VALOR NAO ADER", _
                 "FAMILIAS REPROVADAS", "MOTIVO DEVOLUCAO")
    Dim c As Long
    For c = 1 To 7
        With ws.Cells(3, c)
            .Value = hdrs(c - 1)
            .Font.Bold = True : .Font.Color = RGB(255, 255, 255) : .Interior.Color = RGB(31, 78, 121)
            .HorizontalAlignment = xlCenter : .VerticalAlignment = xlCenter
            .Borders.LineStyle = xlContinuous : .Borders.Color = RGB(170, 170, 170)
        End With
    Next c
    ws.Rows(3).RowHeight = 24

    Dim n As Long : n = sit.Count
    If n > 0 Then
        Dim ks() As String, scr() As Double : ReDim ks(0 To n - 1) : ReDim scr(0 To n - 1)
        Dim ix As Long : ix = 0
        Dim kk As Variant
        For Each kk In sit.Keys
            ks(ix) = CStr(kk)
            scr(ix) = IIf(sit(kk), 1000000000000#, 0#) + vNA(kk)
            ix = ix + 1
        Next kk
        Dim a As Long, b As Long, best As Long, tS As String, tD As Double
        For a = 0 To n - 2
            best = a
            For b = a + 1 To n - 1
                If scr(b) > scr(best) Then best = b
            Next b
            If best <> a Then
                tD = scr(a) : scr(a) = scr(best) : scr(best) = tD
                tS = ks(a) : ks(a) = ks(best) : ks(best) = tS
            End If
        Next a

        Dim outA() As Variant : ReDim outA(1 To n, 1 To 7)
        For ix = 0 To n - 1
            p3 = ks(ix)
            outA(ix + 1, 1) = p3
            outA(ix + 1, 2) = IIf(sit(p3), "REPROVADO", "APROVADO")
            outA(ix + 1, 3) = ods(p3).Count
            outA(ix + 1, 4) = vObra(p3)
            outA(ix + 1, 5) = vNA(p3)
            outA(ix + 1, 6) = IIf(sit(p3), MotivoFamilia(CStr(mot(p3))), "")
            outA(ix + 1, 7) = mot(p3)
        Next ix
        ws.Range(ws.Cells(4, 1), ws.Cells(3 + n, 7)).Value = outA

        Dim wds As Variant : wds = Array(26, 13, 10, 15, 16, 40, 46)
        For c = 1 To 7 : ws.Columns(c).ColumnWidth = wds(c - 1) : Next c
        With ws.Range(ws.Cells(4, 1), ws.Cells(3 + n, 7))
            .Font.Name = "Segoe UI" : .Font.Size = 9 : .VerticalAlignment = xlCenter
            .Borders.LineStyle = xlContinuous : .Borders.Color = RGB(225, 225, 225)
        End With
        ws.Range(ws.Cells(4, 4), ws.Cells(3 + n, 5)).NumberFormat = "#,##0.00"
        ws.Range(ws.Cells(4, 2), ws.Cells(3 + n, 3)).HorizontalAlignment = xlCenter

        For ix = 1 To n
            If CStr(outA(ix, 2)) = "REPROVADO" Then
                ws.Range(ws.Cells(3 + ix, 1), ws.Cells(3 + ix, 7)).Interior.Color = RGB(252, 226, 228)
                With ws.Cells(3 + ix, 2)
                    .Interior.Color = RGB(192, 0, 0) : .Font.Color = RGB(255, 255, 255) : .Font.Bold = True
                End With
            Else
                With ws.Cells(3 + ix, 2)
                    .Interior.Color = RGB(198, 239, 206) : .Font.Color = RGB(0, 97, 0)
                End With
            End If
        Next ix

        ' Tabela estruturada (ListObject) - filtros persistentes e referencia estavel
        On Error Resume Next
        Dim lo As ListObject
        Set lo = ws.ListObjects.Add(xlSrcRange, ws.Range(ws.Cells(3, 1), ws.Cells(3 + n, 7)), , xlYes)
        lo.Name = "tblResumoPEP3" : lo.TableStyle = ""
        On Error GoTo 0
    Else
        ws.Cells(4, 1).Value = "Nenhuma obra encontrada." : ws.Cells(4, 1).Font.Italic = True
    End If

    ' Botao: exporta so as devolucoes (PEP3 reprovados) para envio a projetista
    On Error Resume Next
    Dim btn As Shape
    Set btn = ws.Shapes.AddShape(msoShapeRoundedRectangle, ws.Cells(1, 9).Left, ws.Cells(1, 9).Top, 170, 34)
    btn.Name = "btnExportarDevol"
    btn.TextFrame2.TextRange.Text = "Exportar devolucoes"
    btn.Fill.ForeColor.RGB = RGB(192, 0, 0) : btn.Line.Visible = msoFalse
    btn.TextFrame2.TextRange.Font.Fill.ForeColor.RGB = RGB(255, 255, 255)
    btn.TextFrame2.TextRange.Font.Bold = msoTrue
    btn.OnAction = "ExportarDevolucoes"
    ws.Tab.Color = RGB(31, 78, 121)
    On Error GoTo 0
End Sub

' --------- Exporta os PEP3 reprovados p/ nova planilha (botao / Alt+F8) ---------
Public Sub ExportarDevolucoes()
    Dim wb As Workbook : Set wb = ActiveWorkbook
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = wb.Worksheets("RESUMO SAP x PRJ")
    On Error GoTo 0
    If ws Is Nothing Then
        MsgBox "Aba 'RESUMO SAP x PRJ' nao encontrada. Rode GerarInventario primeiro.", _
               vbExclamation, "Exportar Devolucoes"
        Exit Sub
    End If
    Dim lastR As Long : lastR = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row
    If lastR < 4 Then
        MsgBox "Sem dados na RESUMO SAP x PRJ.", vbInformation, "Exportar Devolucoes"
        Exit Sub
    End If
    Dim d As Variant : d = ws.Range(ws.Cells(4, 1), ws.Cells(lastR, 7)).Value
    Dim i As Long, cnt As Long
    For i = 1 To UBound(d, 1)
        If UCase(Trim(CStr(d(i, 2)))) = "REPROVADO" Then cnt = cnt + 1
    Next i
    If cnt = 0 Then
        MsgBox "Nenhum PEP3 reprovado para exportar.", vbInformation, "Exportar Devolucoes"
        Exit Sub
    End If
    Dim out() As Variant : ReDim out(1 To cnt + 1, 1 To 5)
    out(1, 1) = "PEP3NIVEL" : out(1, 2) = "SITUACAO" : out(1, 3) = "VALOR NAO ADER"
    out(1, 4) = "FAMILIAS REPROVADAS" : out(1, 5) = "MOTIVO DEVOLUCAO"
    Dim rw As Long : rw = 1
    For i = 1 To UBound(d, 1)
        If UCase(Trim(CStr(d(i, 2)))) = "REPROVADO" Then
            rw = rw + 1
            out(rw, 1) = d(i, 1) : out(rw, 2) = d(i, 2) : out(rw, 3) = d(i, 5)
            out(rw, 4) = d(i, 6) : out(rw, 5) = d(i, 7)
        End If
    Next i
    Dim nb As Workbook : Set nb = Workbooks.Add
    Dim ns As Worksheet : Set ns = nb.Worksheets(1) : ns.Name = "DEVOLUCOES"
    ns.Range(ns.Cells(1, 1), ns.Cells(cnt + 1, 5)).Value = out
    With ns.Range("A1:E1")
        .Font.Bold = True : .Interior.Color = RGB(192, 0, 0) : .Font.Color = RGB(255, 255, 255)
    End With
    ns.Range(ns.Cells(2, 3), ns.Cells(cnt + 1, 3)).NumberFormat = "#,##0.00"
    ns.Columns("A:E").AutoFit : ns.Columns(5).ColumnWidth = 55
    MsgBox cnt & " PEP3 reprovado(s) exportado(s) para uma nova planilha." & vbCrLf & _
           "Use 'Salvar Como' para enviar a projetista.", vbInformation, "Exportar Devolucoes"
End Sub

' --------- Historico entre execucoes (aba persistente HISTORICO) ---------
Private Sub AtualizarHistorico(wb As Workbook)
    Dim wsR As Worksheet
    On Error Resume Next
    Set wsR = wb.Worksheets("RESUMO SAP x PRJ")
    On Error GoTo 0
    If wsR Is Nothing Then Exit Sub
    Dim lastR As Long : lastR = wsR.Cells(wsR.Rows.Count, 1).End(xlUp).Row
    If lastR < 4 Then Exit Sub
    Dim d As Variant : d = wsR.Range(wsR.Cells(4, 1), wsR.Cells(lastR, 7)).Value

    Dim ws As Worksheet
    On Error Resume Next
    Set ws = wb.Worksheets("HISTORICO")
    On Error GoTo 0
    Dim prev As Object : Set prev = CreateObject("Scripting.Dictionary")
    If ws Is Nothing Then
        Set ws = wb.Worksheets.Add(After:=wb.Worksheets(wb.Worksheets.Count))
        ws.Name = "HISTORICO"
        ws.Cells(1, 1).Value = "RUN" : ws.Cells(1, 2).Value = "PEP3NIVEL"
        ws.Cells(1, 3).Value = "SITUACAO" : ws.Cells(1, 4).Value = "VALOR NAO ADER"
        ws.Cells(1, 5).Value = "MUDOU"
        With ws.Range("A1:E1")
            .Font.Bold = True : .Interior.Color = RGB(17, 24, 39) : .Font.Color = RGB(255, 255, 255)
        End With
        ws.Columns(1).ColumnWidth = 18 : ws.Columns(2).ColumnWidth = 26
        ws.Columns(3).ColumnWidth = 13 : ws.Columns(4).ColumnWidth = 16 : ws.Columns(5).ColumnWidth = 34
    Else
        Dim lh As Long : lh = ws.Cells(ws.Rows.Count, 2).End(xlUp).Row
        If lh >= 2 Then
            Dim hh As Variant : hh = ws.Range(ws.Cells(2, 2), ws.Cells(lh, 3)).Value
            Dim r As Long, kp As String
            For r = 1 To UBound(hh, 1)
                kp = Trim(CStr(hh(r, 1)))
                If kp <> "" Then prev(kp) = UCase(Trim(CStr(hh(r, 2))))
            Next r
        End If
    End If

    Dim runId As String : runId = Format(Now, "dd/mm/yyyy hh:nn")
    Dim base As Long : base = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row + 1
    Dim i As Long, out() As Variant : ReDim out(1 To UBound(d, 1), 1 To 5)
    Dim p3 As String, si As String
    For i = 1 To UBound(d, 1)
        p3 = Trim(CStr(d(i, 1))) : si = UCase(Trim(CStr(d(i, 2))))
        out(i, 1) = runId : out(i, 2) = p3 : out(i, 3) = si : out(i, 4) = Val0(d(i, 5))
        If Not prev.Exists(p3) Then
            out(i, 5) = "NOVO"
        ElseIf CStr(prev(p3)) <> si Then
            out(i, 5) = "MUDOU (" & prev(p3) & " -> " & si & ")"
        Else
            out(i, 5) = "MANTEVE"
        End If
    Next i
    ws.Range(ws.Cells(base, 1), ws.Cells(base + UBound(d, 1) - 1, 5)).Value = out
    ws.Tab.Color = RGB(60, 60, 60)
End Sub

' --------- Nomes definidos: referencia estavel para formulas do usuario ---------
Private Sub CriarNomesDefinidos(wb As Workbook)
    DefinirNome wb, "ANALISE SAP x PRJ", "dadosAnalise", "PEP3NIVEL", 1, 16
    DefinirNome wb, "PRECO UNITARIO", "dadosPrecoUnitario", "PEP3NIVEL", 1, 14
    DefinirNome wb, "RANKING DE RISCO", "dadosRanking", "PEP3NIVEL", 2, 11
End Sub

Private Sub DefinirNome(wb As Workbook, sheetName As String, nome As String, _
                        token As String, colToken As Long, nCols As Long)
    On Error Resume Next
    Dim ws As Worksheet : Set ws = wb.Worksheets(sheetName)
    If ws Is Nothing Then Exit Sub
    Dim hdrRow As Long, rr As Long, lastScan As Long
    lastScan = ws.Cells(ws.Rows.Count, colToken).End(xlUp).Row
    For rr = 1 To lastScan
        If NormStr(CStr(ws.Cells(rr, colToken).Value)) = token Then hdrRow = rr : Exit For
    Next rr
    If hdrRow = 0 Then Exit Sub
    Dim lastRow As Long : lastRow = ws.Cells(ws.Rows.Count, colToken).End(xlUp).Row
    If lastRow < hdrRow Then Exit Sub
    wb.Names(nome).Delete
    wb.Names.Add Name:=nome, RefersTo:="='" & ws.Name & "'!" & _
        ws.Range(ws.Cells(hdrRow, 1), ws.Cells(lastRow, nCols)).Address
    On Error GoTo 0
End Sub

' --------- Testes de logica de negocio (rode via Alt+F8) ---------
Public Sub TestarLogicaInventario()
    Dim nomes(1 To 60) As String, oks(1 To 60) As Boolean, det(1 To 60) As String
    Dim cnt As Long, pass As Long
    Dim mp As Object : Set mp = CriarMapaNT006()

    RegTest nomes, oks, det, cnt, "EhComCritico CH FUS = True", (EhComCritico(NormStr("CH FUS")) = True)
    RegTest nomes, oks, det, cnt, "EhComCritico PARA RAIO MT = True", (EhComCritico(NormStr("PARA RAIO MT")) = True)
    RegTest nomes, oks, det, cnt, "EhComCritico POSTE = False", (EhComCritico(NormStr("POSTE")) = False)
    RegTest nomes, oks, det, cnt, "CaboComoCOM 10m = True", (CaboComoCOM("CABO ISOLADO", 10) = True)
    RegTest nomes, oks, det, cnt, "CaboComoCOM 20m = False", (CaboComoCOM("CABO ISOLADO", 20) = False)
    RegTest nomes, oks, det, cnt, "EhAderente COND 100/100 = True", (EhAderente("COND", 100, 100, "") = True)
    RegTest nomes, oks, det, cnt, "EhAderente COND 100/105 = True", (EhAderente("COND", 100, 105, "") = True)
    RegTest nomes, oks, det, cnt, "EhAderente COND 100/50 = False", (EhAderente("COND", 100, 50, "") = False)
    RegTest nomes, oks, det, cnt, "EhAderente UC ADERENTE = True", (EhAderente("PARAFUSO", "x", "y", "ADERENTE") = True)
    RegTest nomes, oks, det, cnt, "EhUnidadeInteira M = False", (EhUnidadeInteira("M") = False)
    RegTest nomes, oks, det, cnt, "EhUnidadeInteira UN = True", (EhUnidadeInteira("UN") = True)
    RegTest nomes, oks, det, cnt, "NT006 133100007 e ancora", (GetMat(mp, "133100007").EhAncora = True)
    RegTest nomes, oks, det, cnt, "NT006 123140003 RazaoMin = 2", (GetMat(mp, "123140003").RazaoMin = 2)

    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ActiveWorkbook.Worksheets("TESTES")
    On Error GoTo 0
    If ws Is Nothing Then
        Set ws = ActiveWorkbook.Worksheets.Add(After:=ActiveWorkbook.Worksheets(ActiveWorkbook.Worksheets.Count))
        ws.Name = "TESTES"
    Else
        ws.Cells.Clear
    End If
    ws.Cells(1, 1).Value = "TESTE DE LOGICA - " & Format(Now, "dd/mm/yyyy hh:nn")
    ws.Cells(1, 1).Font.Bold = True
    ws.Cells(2, 1).Value = "TESTE" : ws.Cells(2, 2).Value = "RESULTADO"
    ws.Range("A2:B2").Font.Bold = True
    Dim i As Long
    For i = 1 To cnt
        ws.Cells(2 + i, 1).Value = nomes(i)
        ws.Cells(2 + i, 2).Value = det(i)
        If oks(i) Then pass = pass + 1
        ws.Cells(2 + i, 2).Interior.Color = IIf(oks(i), RGB(198, 239, 206), RGB(255, 199, 206))
    Next i
    ws.Columns(1).ColumnWidth = 46 : ws.Columns(2).ColumnWidth = 14
    ws.Cells(3 + cnt, 1).Value = pass & " de " & cnt & " testes passaram"
    ws.Cells(3 + cnt, 1).Font.Bold = True
    MsgBox pass & " de " & cnt & " testes passaram." & _
           IIf(pass = cnt, " Tudo OK.", " HA FALHAS - ver aba TESTES."), _
           IIf(pass = cnt, vbInformation, vbExclamation), "Testes de Logica"
End Sub

Private Sub RegTest(nomes() As String, oks() As Boolean, det() As String, _
                    cnt As Long, nome As String, ok As Boolean)
    cnt = cnt + 1
    nomes(cnt) = nome : oks(cnt) = ok : det(cnt) = IIf(ok, "PASSOU", "FALHOU")
End Sub
