//+------------------------------------------------------------------+
//|  QUANT_OPS_v2.mq4                                                 |
//|  QUANT OPS v2 - Confluencia + Price Action + Semaforo             |
//|  Porte do app QUANT OPS / do indicador Pine para MetaTrader 4     |
//+------------------------------------------------------------------+
//  FERRAMENTA DE ESTUDO. Nao e recomendacao de investimento.
//  Operacoes alavancadas (CFD/forex) e expiracoes curtas sao de risco
//  altissimo: spread, swap e comissao corroem qualquer vantagem. Valide em
//  conta DEMO por tempo suficiente antes de qualquer uso com capital real.
//
//  O QUE FAZ (tudo ja ligado por padrao):
//    - Confluencia multi-fator: tendencia (EMA rapida x lenta), EMA200,
//      RSI, ATR, estrutura, MACD, Bandas de Bollinger e padrao de vela
//    - Portoes de contexto: multi-timeframe, sessao forte, distancia de
//      S/R e Price Action (so entrar no TESTE da zona)
//    - Zonas de Suporte/Resistencia (2 por lado) com FORCA por n de toques
//    - Fibonacci automatico da ultima perna (38.2 / 50 / 61.8)
//    - LTA / LTB automaticas por pivos
//    - Divergencias RSI x preco
//    - Selo de qualidade A / B / C e SEMAFORO (ENTRAR / ESPERAR / EVITAR)
//    - ENTRADAS NIVEL A e B: setas separadas + alerta e push no celular
//
//  LIMITE HONESTO: o MetaTrader nao roda a IA de otimizacao nem o registro
//  de calibracao do app web - isso continua no app.
//+------------------------------------------------------------------+
#property copyright "QUANT OPS - ferramenta de estudo"
#property version   "2.00"
#property strict
#property indicator_chart_window
#property indicator_buffers 7

//--- plots
#property indicator_color1 clrDodgerBlue
#property indicator_color2 clrOrange
#property indicator_color3 clrMediumPurple
#property indicator_color4 clrLime
#property indicator_color5 clrRed
#property indicator_color6 clrOrange
#property indicator_color7 clrMaroon

//+------------------------------------------------------------------+
//| INPUTS - (1) FATORES DE CONFLUENCIA  (todos ligados)              |
//+------------------------------------------------------------------+
extern string  __f__        = "===== 1) FATORES DE CONFLUENCIA =====";
extern bool    UsarTendencia = true;   // Tendencia (EMA rapida x lenta)
extern int     EmaRapida     = 9;      // EMA rapida
extern int     EmaLenta      = 21;     // EMA lenta
extern bool    UsarEma200    = true;   // EMA 200 (vies macro)
extern int     PeriodoEma200 = 200;    // Periodo da EMA 200
extern bool    UsarRsi       = true;   // RSI (reversao de sobrevenda/sobrecompra)
extern int     PeriodoRsi    = 14;     // Periodo do RSI
extern int     RsiSobrevenda = 30;     // Nivel de sobrevenda
extern int     RsiSobrecompra= 70;     // Nivel de sobrecompra
extern bool    UsarAtr       = true;   // ATR (volatilidade acima da media)
extern int     PeriodoAtr    = 14;     // Periodo do ATR
extern int     MediaAtr      = 50;     // Media do ATR
extern bool    UsarEstrutura = true;   // Estrutura (rompimento de topo/fundo)
extern int     LookbackEstr  = 20;     // Lookback da estrutura
extern bool    UsarMacd      = true;   // MACD (momentum)
extern bool    UsarBollinger = true;   // Bandas de Bollinger (reversao em 2 sigma)
extern bool    UsarPadraoVela= true;   // Padrao de vela (engolfo / martelo)

//+------------------------------------------------------------------+
//| INPUTS - (2) CONFLUENCIA                                          |
//+------------------------------------------------------------------+
extern string  __c__        = "===== 2) CONFLUENCIA =====";
extern int     MinimoFatores = 4;      // Minimo de fatores a favor (4 = equilibrio do app)
extern int     Cooldown      = 5;      // Cooldown (velas entre sinais)
extern bool    SoNoFechamento= true;   // So sinaliza na vela FECHADA

//+------------------------------------------------------------------+
//| INPUTS - (3) PORTOES DE CONTEXTO  (todos ligados)                 |
//+------------------------------------------------------------------+
extern string  __p__        = "===== 3) PORTOES (CONTEXTO) =====";
extern bool    UsarMtf       = true;   // Multi-timeframe: so a favor do TF maior
extern ENUM_TIMEFRAMES TfMaior = PERIOD_CURRENT; // TF maior (CURRENT = automatico 5x)
extern bool    UsarSessao    = true;   // So nas sessoes fortes (Londres/NY)
extern int     SessaoInicio  = 7;      // Hora inicial (hora do SERVIDOR)
extern int     SessaoFim     = 21;     // Hora final (hora do SERVIDOR)
extern bool    UsarSr        = true;   // Vetar entrada colada em S/R contrario
extern double  SrDistAtrMin  = 0.5;    // Distancia minima de S/R (x ATR)
extern bool    UsarPriceAction = true; // Price Action: so entrar no TESTE de zona
extern double  PaDistAtrMax  = 0.8;    // Distancia maxima da zona (x ATR)

//+------------------------------------------------------------------+
//| INPUTS - (4) PRICE ACTION & VISUAL  (tudo desenhado)              |
//+------------------------------------------------------------------+
extern string  __v__        = "===== 4) PRICE ACTION & VISUAL =====";
extern int     ForcaPivo     = 5;      // Forca do pivo (barras de cada lado)
extern bool    MostrarZonas  = true;   // Zonas de S/R (2 por lado, forca por toques)
extern bool    MostrarLt     = true;   // LTA / LTB automaticas
extern bool    MostrarFib    = true;   // Fibonacci automatico (38.2 / 50 / 61.8)
extern int     FibLookback   = 120;    // Lookback da perna do Fibonacci
extern bool    MostrarDiv    = true;   // Divergencias RSI x preco
extern bool    MostrarPainel = true;   // Painel de decisao (semaforo)
extern int     PainelX       = 12;     // Painel - distancia da borda direita
extern int     PainelY       = 22;     // Painel - distancia do topo

//+------------------------------------------------------------------+
//| INPUTS - (5) ALERTAS                                              |
//+------------------------------------------------------------------+
extern string  __a__        = "===== 5) ALERTAS =====";
extern bool    AlertaPopup   = true;   // Alerta na tela do MetaTrader
extern bool    AlertaPush    = true;   // Push no celular (MetaTrader mobile)
extern bool    AlertaSom     = true;   // Som
extern bool    AlertarNivelB = true;   // Alertar tambem o nivel B (false = so nivel A)

//+------------------------------------------------------------------+
//| INPUTS - (6) DESEMPENHO                                           |
//+------------------------------------------------------------------+
extern string  __d__        = "===== 6) DESEMPENHO =====";
extern int     MaxBarras     = 600;    // Maximo de barras calculadas (historico)
extern int     EscaneioPivos = 250;    // Barras varridas atras em busca de pivos

//--- buffers
double BufEmaR[];
double BufEmaL[];
double BufEma200[];
double BufCallA[];
double BufPutA[];
double BufCallB[];
double BufPutB[];

//--- estado dos pivos (indice 0 = pivo MAIS RECENTE)
#define MAXPIV 12
double   gRes[MAXPIV];
int      gResB[MAXPIV];
int      gNRes = 0;
double   gSup[MAXPIV];
int      gSupB[MAXPIV];
int      gNSup = 0;

//--- estado do semaforo (preenchido na barra atual, usado no painel)
string   gSemaforo   = "ESPERAR";
string   gSemMotivo  = "";
string   gSelo       = "C";
int      gDirDom     = 0;
int      gScoreL     = 0;
int      gScoreS     = 0;
int      gHabilitados= 0;
int      gAlvo       = 0;
int      gHtfDir     = 0;
string   gEstrutura  = "Indefinida";
int      gEstrDir    = 0;
int      gForcaRes   = 0;
int      gForcaSup   = 0;
bool     gNaSessao   = true;
bool     gTemSinal   = false;

datetime gUltimoAlerta = 0;

const string PFX = "QO_";

//+------------------------------------------------------------------+
int OnInit()
  {
   IndicatorShortName("QUANT OPS v2 [estudo]");
   IndicatorDigits(Digits);

   SetIndexBuffer(0, BufEmaR);
   SetIndexStyle(0, DRAW_LINE, STYLE_SOLID, 1);
   SetIndexLabel(0, "EMA rapida");

   SetIndexBuffer(1, BufEmaL);
   SetIndexStyle(1, DRAW_LINE, STYLE_SOLID, 1);
   SetIndexLabel(1, "EMA lenta");

   SetIndexBuffer(2, BufEma200);
   SetIndexStyle(2, DRAW_LINE, STYLE_SOLID, 2);
   SetIndexLabel(2, "EMA 200");

   SetIndexBuffer(3, BufCallA);
   SetIndexStyle(3, DRAW_ARROW, EMPTY, 3);
   SetIndexArrow(3, 233);
   SetIndexEmptyValue(3, 0.0);
   SetIndexLabel(3, "CALL nivel A");

   SetIndexBuffer(4, BufPutA);
   SetIndexStyle(4, DRAW_ARROW, EMPTY, 3);
   SetIndexArrow(4, 234);
   SetIndexEmptyValue(4, 0.0);
   SetIndexLabel(4, "PUT nivel A");

   SetIndexBuffer(5, BufCallB);
   SetIndexStyle(5, DRAW_ARROW, EMPTY, 1);
   SetIndexArrow(5, 233);
   SetIndexEmptyValue(5, 0.0);
   SetIndexLabel(5, "CALL nivel B");

   SetIndexBuffer(6, BufPutB);
   SetIndexStyle(6, DRAW_ARROW, EMPTY, 1);
   SetIndexArrow(6, 234);
   SetIndexEmptyValue(6, 0.0);
   SetIndexLabel(6, "PUT nivel B");

   if(ForcaPivo < 2)      ForcaPivo = 2;
   if(MaxBarras < 120)    MaxBarras = 120;
   if(EscaneioPivos < 60) EscaneioPivos = 60;

   return(INIT_SUCCEEDED);
  }
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   LimparObjetos();
   Comment("");
  }
//+------------------------------------------------------------------+
void LimparObjetos()
  {
   for(int i = ObjectsTotal() - 1; i >= 0; i--)
     {
      string nome = ObjectName(i);
      if(StringSubstr(nome, 0, StringLen(PFX)) == PFX)
         ObjectDelete(nome);
     }
  }
//+------------------------------------------------------------------+
//| TF maior automatico (aprox. 5x o atual)                           |
//+------------------------------------------------------------------+
int TfEfetivo()
  {
   if(TfMaior != PERIOD_CURRENT)
      return((int)TfMaior);
   switch(Period())
     {
      case PERIOD_M1:  return(PERIOD_M5);
      case PERIOD_M5:  return(PERIOD_M15);
      case PERIOD_M15: return(PERIOD_H1);
      case PERIOD_M30: return(PERIOD_H4);
      case PERIOD_H1:  return(PERIOD_H4);
      case PERIOD_H4:  return(PERIOD_D1);
      case PERIOD_D1:  return(PERIOD_W1);
     }
   return(PERIOD_W1);
  }
//+------------------------------------------------------------------+
string TfNome(int tf)
  {
   switch(tf)
     {
      case PERIOD_M1:  return("M1");
      case PERIOD_M5:  return("M5");
      case PERIOD_M15: return("M15");
      case PERIOD_M30: return("M30");
      case PERIOD_H1:  return("H1");
      case PERIOD_H4:  return("H4");
      case PERIOD_D1:  return("D1");
      case PERIOD_W1:  return("W1");
      case PERIOD_MN1: return("MN");
     }
   return("?");
  }
//+------------------------------------------------------------------+
//| PIVOS                                                             |
//+------------------------------------------------------------------+
bool EhPivoAlto(int j)
  {
   if(j - ForcaPivo < 0 || j + ForcaPivo >= Bars) return(false);
   double h = High[j];
   for(int k = 1; k <= ForcaPivo; k++)
     {
      if(High[j - k] > h) return(false);
      if(High[j + k] > h) return(false);
     }
   return(true);
  }
//+------------------------------------------------------------------+
bool EhPivoBaixo(int j)
  {
   if(j - ForcaPivo < 0 || j + ForcaPivo >= Bars) return(false);
   double l = Low[j];
   for(int k = 1; k <= ForcaPivo; k++)
     {
      if(Low[j - k] < l) return(false);
      if(Low[j + k] < l) return(false);
     }
   return(true);
  }
//+------------------------------------------------------------------+
//| Coleta os pivos JA CONFIRMADOS na barra 'base' (indice 0 = mais   |
//| recente). Um pivo em j so e conhecido a partir da barra j-ForcaPivo|
//+------------------------------------------------------------------+
void ColetarPivos(int base)
  {
   gNRes = 0;
   gNSup = 0;
   int ini = base + ForcaPivo;
   int fim = MathMin(Bars - ForcaPivo - 2, ini + EscaneioPivos);
   for(int j = ini; j <= fim; j++)
     {
      if(gNRes < MAXPIV && EhPivoAlto(j))
        {
         gRes[gNRes]  = High[j];
         gResB[gNRes] = j;
         gNRes++;
        }
      if(gNSup < MAXPIV && EhPivoBaixo(j))
        {
         gSup[gNSup]  = Low[j];
         gSupB[gNSup] = j;
         gNSup++;
        }
      if(gNRes >= MAXPIV && gNSup >= MAXPIV) break;
     }
  }
//+------------------------------------------------------------------+
//| Forca da zona = quantos pivos caem dentro de +/- tol do nivel     |
//+------------------------------------------------------------------+
int ContaToques(double &arr[], int n, double nivel, double tol)
  {
   int c = 0;
   for(int i = 0; i < n; i++)
      if(MathAbs(arr[i] - nivel) <= tol) c++;
   return(c);
  }
//+------------------------------------------------------------------+
//| Segundo nivel DISTINTO (fora da tolerancia do primeiro)           |
//+------------------------------------------------------------------+
double SegundoNivel(double &arr[], int n, double primeiro, double tol)
  {
   for(int i = 1; i < n; i++)
      if(MathAbs(arr[i] - primeiro) > tol) return(arr[i]);
   return(0.0);
  }
//+------------------------------------------------------------------+
//| Media do ATR (o MT4 nao tem iATR sobre media pronta)              |
//+------------------------------------------------------------------+
double AtrMedio(int i)
  {
   double s = 0;
   for(int k = 0; k < MediaAtr; k++)
      s += iATR(NULL, 0, PeriodoAtr, i + k);
   return(s / MediaAtr);
  }
//+------------------------------------------------------------------+
bool NaSessao(int i)
  {
   if(!UsarSessao) return(true);
   int h = TimeHour(Time[i]);
   if(SessaoInicio == SessaoFim) return(true);
   if(SessaoInicio < SessaoFim)  return(h >= SessaoInicio && h < SessaoFim);
   return(h >= SessaoInicio || h < SessaoFim);   // janela que cruza a meia-noite
  }
//+------------------------------------------------------------------+
//| Cooldown: houve sinal nas ultimas 'Cooldown' velas?               |
//+------------------------------------------------------------------+
bool CooldownLivre(int i)
  {
   if(Cooldown <= 0) return(true);
   for(int k = 1; k <= Cooldown; k++)
     {
      int j = i + k;
      if(j >= Bars) break;
      if(BufCallA[j] != 0.0 || BufPutA[j] != 0.0 || BufCallB[j] != 0.0 || BufPutB[j] != 0.0)
         return(false);
     }
   return(true);
  }
//+------------------------------------------------------------------+
//| CALCULO PRINCIPAL                                                 |
//+------------------------------------------------------------------+
int OnCalculate(const int rates_total,
                const int prev_calculated,
                const datetime &time[],
                const double &open[],
                const double &high[],
                const double &low[],
                const double &close[],
                const long &tick_volume[],
                const long &volume[],
                const int &spread[])
  {
   int minimo = MathMax(PeriodoEma200, FibLookback) + MediaAtr + ForcaPivo * 2 + 30;
   if(rates_total < minimo + 10) return(0);

   int limite;
   if(prev_calculated == 0)
     {
      ArrayInitialize(BufCallA, 0.0);
      ArrayInitialize(BufPutA,  0.0);
      ArrayInitialize(BufCallB, 0.0);
      ArrayInitialize(BufPutB,  0.0);
      limite = MathMin(rates_total - minimo, MaxBarras);
     }
   else
      limite = MathMin(rates_total - prev_calculated + 1, MaxBarras);
   if(limite < 0) limite = 0;

   int tf = TfEfetivo();

   for(int i = limite; i >= 0; i--)
     {
      //--- medias sempre desenhadas
      BufEmaR[i]   = iMA(NULL, 0, EmaRapida,     0, MODE_EMA, PRICE_CLOSE, i);
      BufEmaL[i]   = iMA(NULL, 0, EmaLenta,      0, MODE_EMA, PRICE_CLOSE, i);
      BufEma200[i] = iMA(NULL, 0, PeriodoEma200, 0, MODE_EMA, PRICE_CLOSE, i);

      BufCallA[i] = 0.0;
      BufPutA[i]  = 0.0;
      BufCallB[i] = 0.0;
      BufPutB[i]  = 0.0;

      //--- vela ainda em formacao: nao grava seta se "so no fechamento"
      if(i == 0 && SoNoFechamento) continue;

      CalcularBarra(i, tf, true);
     }

   //--- estado/desenho da barra atual
   AtualizarEstado(0, tf);
   Desenhar();
   Alertar();

   return(rates_total);
  }
//+------------------------------------------------------------------+
//| Calcula fatores, portoes, selo e (opcionalmente) grava as setas    |
//+------------------------------------------------------------------+
void CalcularBarra(int i, int tf, bool gravarSetas)
  {
   double emaR   = iMA(NULL, 0, EmaRapida,     0, MODE_EMA, PRICE_CLOSE, i);
   double emaL   = iMA(NULL, 0, EmaLenta,      0, MODE_EMA, PRICE_CLOSE, i);
   double ema200 = iMA(NULL, 0, PeriodoEma200, 0, MODE_EMA, PRICE_CLOSE, i);
   double rsi    = iRSI(NULL, 0, PeriodoRsi, PRICE_CLOSE, i);
   double rsiAnt = iRSI(NULL, 0, PeriodoRsi, PRICE_CLOSE, i + 1);
   double atr    = iATR(NULL, 0, PeriodoAtr, i);
   double atrMed = AtrMedio(i);
   double macdH  = iMACD(NULL, 0, 12, 26, 9, PRICE_CLOSE, MODE_MAIN,   i)
                 - iMACD(NULL, 0, 12, 26, 9, PRICE_CLOSE, MODE_SIGNAL, i);
   double macdHa = iMACD(NULL, 0, 12, 26, 9, PRICE_CLOSE, MODE_MAIN,   i + 1)
                 - iMACD(NULL, 0, 12, 26, 9, PRICE_CLOSE, MODE_SIGNAL, i + 1);
   double bbSup  = iBands(NULL, 0, 20, 2.0, 0, PRICE_CLOSE, MODE_UPPER, i);
   double bbInf  = iBands(NULL, 0, 20, 2.0, 0, PRICE_CLOSE, MODE_LOWER, i);

   double c = Close[i], o = Open[i], h = High[i], l = Low[i];

   //--- fatores (mesma logica do app e do Pine)
   bool fTendL = emaR > emaL;
   bool fTendS = emaR < emaL;
   bool fMacroL = c > ema200;
   bool fMacroS = c < ema200;
   bool fRsiL = (rsiAnt <= RsiSobrevenda  && rsi > RsiSobrevenda);
   bool fRsiS = (rsiAnt >= RsiSobrecompra && rsi < RsiSobrecompra);
   bool fAtr  = atr > atrMed;

   double maxRec = High[iHighest(NULL, 0, MODE_HIGH, LookbackEstr, i + 1)];
   double minRec = Low [iLowest (NULL, 0, MODE_LOW,  LookbackEstr, i + 1)];
   bool fEstrL = c > maxRec;
   bool fEstrS = c < minRec;

   bool fMacdL = (macdH > 0 && macdH >= macdHa);
   bool fMacdS = (macdH < 0 && macdH <= macdHa);
   bool fBollL = c < bbInf;
   bool fBollS = c > bbSup;

   double corpo = MathAbs(c - o);
   bool engolfoL = (c > o && Close[i+1] < Open[i+1] && c >= Open[i+1] && o <= Close[i+1]);
   bool engolfoS = (c < o && Close[i+1] > Open[i+1] && c <= Open[i+1] && o >= Close[i+1]);
   bool marteloL = ((h - l) > 0 && (MathMin(o, c) - l) > corpo * 2.0 && c > o);
   bool marteloS = ((h - l) > 0 && (h - MathMax(o, c)) > corpo * 2.0 && c < o);
   bool fPadL = (engolfoL || marteloL);
   bool fPadS = (engolfoS || marteloS);

   int scoreL = 0, scoreS = 0, habil = 0;
   if(UsarTendencia)  { habil++; if(fTendL) scoreL++;  if(fTendS) scoreS++;  }
   if(UsarEma200)     { habil++; if(fMacroL) scoreL++; if(fMacroS) scoreS++; }
   if(UsarRsi)        { habil++; if(fRsiL) scoreL++;   if(fRsiS) scoreS++;   }
   if(UsarAtr)        { habil++; if(fAtr) { scoreL++; scoreS++; }            }
   if(UsarEstrutura)  { habil++; if(fEstrL) scoreL++;  if(fEstrS) scoreS++;  }
   if(UsarMacd)       { habil++; if(fMacdL) scoreL++;  if(fMacdS) scoreS++;  }
   if(UsarBollinger)  { habil++; if(fBollL) scoreL++;  if(fBollS) scoreS++;  }
   if(UsarPadraoVela) { habil++; if(fPadL) scoreL++;   if(fPadS) scoreS++;   }

   int alvo = MathMin(MinimoFatores, habil);

   //--- pivos / zonas como estavam NAQUELA barra
   ColetarPivos(i);
   double tolZona = atr * 0.6;
   double resProx = (gNRes > 0) ? gRes[0] : 0.0;
   double supProx = (gNSup > 0) ? gSup[0] : 0.0;

   //--- portoes
   bool sess = NaSessao(i);

   int htfDir = 0;
   if(UsarMtf)
     {
      int hs = iBarShift(NULL, tf, Time[i], false);
      double hr = iMA(NULL, tf, EmaRapida, 0, MODE_EMA, PRICE_CLOSE, hs);
      double hl = iMA(NULL, tf, EmaLenta,  0, MODE_EMA, PRICE_CLOSE, hs);
      htfDir = (hr > hl) ? 1 : ((hr < hl) ? -1 : 0);
     }
   bool mtfOkL = (!UsarMtf || htfDir ==  1);
   bool mtfOkS = (!UsarMtf || htfDir == -1);

   bool srOkL = (!UsarSr || resProx == 0.0 || (resProx - c) > atr * SrDistAtrMin);
   bool srOkS = (!UsarSr || supProx == 0.0 || (c - supProx) > atr * SrDistAtrMin);

   bool paOkL = (!UsarPriceAction || (supProx != 0.0 && MathAbs(c - supProx) <= atr * PaDistAtrMax));
   bool paOkS = (!UsarPriceAction || (resProx != 0.0 && MathAbs(c - resProx) <= atr * PaDistAtrMax));

   bool brutoL = (habil > 0 && scoreL >= alvo && scoreL > scoreS);
   bool brutoS = (habil > 0 && scoreS >= alvo && scoreS > scoreL);

   //--- selo A / B / C
   int dirDom = (scoreL >= scoreS) ? 1 : -1;
   int scoreDom = (dirDom == 1) ? scoreL : scoreS;
   int exigA = MathMax(1, (int)MathCeil(habil * 0.7));
   bool htfOk = (dirDom == 1) ? mtfOkL : mtfOkS;
   bool srOk  = (dirDom == 1) ? srOkL  : srOkS;
   bool paOk  = (dirDom == 1) ? paOkL  : paOkS;

   string selo = "C";
   if(scoreDom >= exigA && htfOk && srOk && sess)      selo = "A";
   else if(scoreDom >= alvo && htfOk && srOk)          selo = "B";

   bool sinalL = (brutoL && sess && mtfOkL && srOkL && paOkL && CooldownLivre(i));
   bool sinalS = (brutoS && sess && mtfOkS && srOkS && paOkS && CooldownLivre(i) && !sinalL);

   if(gravarSetas)
     {
      double desl = atr * 0.6;
      if(sinalL && selo == "A") BufCallA[i] = Low[i]  - desl;
      if(sinalS && selo == "A") BufPutA[i]  = High[i] + desl;
      if(sinalL && selo == "B") BufCallB[i] = Low[i]  - desl;
      if(sinalS && selo == "B") BufPutB[i]  = High[i] + desl;
     }

   //--- exporta o estado (usado pelo painel quando i == 0)
   gScoreL      = scoreL;
   gScoreS      = scoreS;
   gHabilitados = habil;
   gAlvo        = alvo;
   gHtfDir      = htfDir;
   gSelo        = selo;
   gDirDom      = dirDom;
   gNaSessao    = sess;
   gTemSinal    = (brutoL || brutoS);
   gForcaRes    = (gNRes > 0) ? ContaToques(gRes, gNRes, gRes[0], tolZona) : 0;
   gForcaSup    = (gNSup > 0) ? ContaToques(gSup, gNSup, gSup[0], tolZona) : 0;

   //--- estrutura vigente (manda o swing mais recente)
   bool topoAlto  = (gNRes >= 2 && gRes[0] > gRes[1]);
   bool fundoAlto = (gNSup >= 2 && gSup[0] > gSup[1]);
   if(gNRes < 2 || gNSup < 2)            { gEstrutura = "Indefinida";    gEstrDir = 0;  }
   else if(topoAlto && fundoAlto)        { gEstrutura = "Alta (HH+HL)";  gEstrDir = 1;  }
   else if(!topoAlto && !fundoAlto)      { gEstrutura = "Baixa (LH+LL)"; gEstrDir = -1; }
   else if(!topoAlto && fundoAlto)       { gEstrutura = "Compressao";    gEstrDir = 0;  }
   else                                  { gEstrutura = "Expansao";      gEstrDir = 0;  }

   //--- SEMAFORO: a decisao unica (ENTRAR abre para selo A **ou B**)
   bool mtfContra = (UsarMtf && htfDir != 0 && htfDir == -dirDom);
   if(!sess)
     { gSemaforo = "EVITAR";  gSemMotivo = "fora da sessao forte"; }
   else if(mtfContra)
     { gSemaforo = "EVITAR";  gSemMotivo = "contra o TF maior " + TfNome(tf); }
   else if(selo == "C" && gTemSinal)
     { gSemaforo = "EVITAR";  gSemMotivo = "selo C - qualidade baixa"; }
   else if(!gTemSinal)
     { gSemaforo = "ESPERAR"; gSemMotivo = "sem confluencia (" + (string)scoreL + " CALL / " + (string)scoreS + " PUT)"; }
   else if(!paOk)
     { gSemaforo = "ESPERAR"; gSemMotivo = "longe da zona - espere o teste"; }
   else if(selo == "A" || selo == "B")
     {
      gSemaforo  = "ENTRAR";
      gSemMotivo = ((dirDom == 1) ? "CALL selo " : "PUT selo ") + selo
                 + ((selo == "A") ? " - portoes fechados" : " - qualidade boa");
     }
   else
     { gSemaforo = "ESPERAR"; gSemMotivo = "aguarde grau A/B"; }
  }
//+------------------------------------------------------------------+
void AtualizarEstado(int i, int tf)
  {
   CalcularBarra(i, tf, false);
  }
//+------------------------------------------------------------------+
//| DESENHO: zonas S/R (2 por lado), LTA/LTB, Fibonacci e painel      |
//+------------------------------------------------------------------+
void Desenhar()
  {
   ColetarPivos(0);
   double atr = iATR(NULL, 0, PeriodoAtr, 0);
   double tol = atr * 0.6;
   datetime tFim = Time[0] + 10 * Period() * 60;

   //--- ZONAS DE SUPORTE / RESISTENCIA -----------------------------
   ObjectDelete(PFX + "zRes");  ObjectDelete(PFX + "zRes2");
   ObjectDelete(PFX + "zSup");  ObjectDelete(PFX + "zSup2");
   ObjectDelete(PFX + "tRes");  ObjectDelete(PFX + "tRes2");
   ObjectDelete(PFX + "tSup");  ObjectDelete(PFX + "tSup2");

   if(MostrarZonas)
     {
      if(gNRes > 0)
        {
         double r1 = gRes[0];
         int    f1 = ContaToques(gRes, gNRes, r1, tol);
         datetime tIni = Time[MathMin(Bars - 1, gResB[0] + 30)];
         CriarZona(PFX + "zRes", tIni, r1 + tol, tFim, r1 - tol, clrTomato, (f1 >= 3));
         CriarTexto(PFX + "tRes", Time[MathMin(Bars-1, 20)], r1 + tol, "R " + Rotulo(f1) + " - " + (string)f1 + "x", clrTomato);

         double r2 = SegundoNivel(gRes, gNRes, r1, tol);
         if(r2 != 0.0)
           {
            int f2 = ContaToques(gRes, gNRes, r2, tol);
            CriarZona(PFX + "zRes2", tIni, r2 + tol, tFim, r2 - tol, clrIndianRed, false);
            CriarTexto(PFX + "tRes2", Time[MathMin(Bars-1, 20)], r2 + tol, "R2 - " + (string)f2 + "x", clrIndianRed);
           }
        }
      if(gNSup > 0)
        {
         double s1 = gSup[0];
         int    g1 = ContaToques(gSup, gNSup, s1, tol);
         datetime tIni = Time[MathMin(Bars - 1, gSupB[0] + 30)];
         CriarZona(PFX + "zSup", tIni, s1 + tol, tFim, s1 - tol, clrMediumSeaGreen, (g1 >= 3));
         CriarTexto(PFX + "tSup", Time[MathMin(Bars-1, 20)], s1 - tol, "S " + Rotulo(g1) + " - " + (string)g1 + "x", clrMediumSeaGreen);

         double s2 = SegundoNivel(gSup, gNSup, s1, tol);
         if(s2 != 0.0)
           {
            int g2 = ContaToques(gSup, gNSup, s2, tol);
            CriarZona(PFX + "zSup2", tIni, s2 + tol, tFim, s2 - tol, clrSeaGreen, false);
            CriarTexto(PFX + "tSup2", Time[MathMin(Bars-1, 20)], s2 - tol, "S2 - " + (string)g2 + "x", clrSeaGreen);
           }
        }
     }

   //--- LTA / LTB ---------------------------------------------------
   ObjectDelete(PFX + "lta");
   ObjectDelete(PFX + "ltb");
   if(MostrarLt)
     {
      // LTA = fundos ASCENDENTES (o mais recente acima do anterior)
      if(gNSup >= 2 && gSup[0] > gSup[1] && gSupB[1] > gSupB[0])
        {
         double incl = (gSup[0] - gSup[1]) / (double)(gSupB[1] - gSupB[0]);
         double proj = gSup[0] + incl * (gSupB[0] + 5);
         CriarLinha(PFX + "lta", Time[gSupB[1]], gSup[1], Time[0] + 5 * Period() * 60, proj, clrMediumSeaGreen);
        }
      // LTB = topos DESCENDENTES
      if(gNRes >= 2 && gRes[0] < gRes[1] && gResB[1] > gResB[0])
        {
         double incl = (gRes[0] - gRes[1]) / (double)(gResB[1] - gResB[0]);
         double proj = gRes[0] + incl * (gResB[0] + 5);
         CriarLinha(PFX + "ltb", Time[gResB[1]], gRes[1], Time[0] + 5 * Period() * 60, proj, clrTomato);
        }
     }

   //--- FIBONACCI da ultima perna -----------------------------------
   ObjectDelete(PFX + "f382"); ObjectDelete(PFX + "f500"); ObjectDelete(PFX + "f618");
   ObjectDelete(PFX + "n382"); ObjectDelete(PFX + "n500"); ObjectDelete(PFX + "n618");
   if(MostrarFib)
     {
      int look = MathMin(FibLookback, Bars - 2);
      int sHi = iHighest(NULL, 0, MODE_HIGH, look, 0);
      int sLo = iLowest (NULL, 0, MODE_LOW,  look, 0);
      double hi = High[sHi], lo = Low[sLo];
      double amp = hi - lo;
      if(amp > 0)
        {
         bool alta = (sLo > sHi);                    // fundo antes do topo = perna de alta
         double f382 = alta ? hi - amp * 0.382 : lo + amp * 0.382;
         double f500 = alta ? hi - amp * 0.500 : lo + amp * 0.500;
         double f618 = alta ? hi - amp * 0.618 : lo + amp * 0.618;
         datetime tIni = Time[MathMin(Bars - 1, MathMax(sHi, sLo))];
         CriarFib(PFX + "f382", tIni, f382, tFim, clrMediumPurple);
         CriarFib(PFX + "f500", tIni, f500, tFim, clrMediumPurple);
         CriarFib(PFX + "f618", tIni, f618, tFim, clrMediumPurple);
         CriarTexto(PFX + "n382", Time[0], f382, " 38.2", clrMediumPurple);
         CriarTexto(PFX + "n500", Time[0], f500, " 50.0", clrMediumPurple);
         CriarTexto(PFX + "n618", Time[0], f618, " 61.8", clrMediumPurple);
        }
     }

   //--- DIVERGENCIAS RSI x PRECO ------------------------------------
   ObjectDelete(PFX + "divA");
   ObjectDelete(PFX + "divB");
   if(MostrarDiv)
     {
      if(gNRes >= 2)
        {
         double rsi0 = iRSI(NULL, 0, PeriodoRsi, PRICE_CLOSE, gResB[0]);
         double rsi1 = iRSI(NULL, 0, PeriodoRsi, PRICE_CLOSE, gResB[1]);
         if(gRes[0] > gRes[1] && rsi0 < rsi1)
            CriarSeta(PFX + "divB", Time[gResB[0]], High[gResB[0]] + tol * 0.5, 242, clrRed);
        }
      if(gNSup >= 2)
        {
         double rsi0 = iRSI(NULL, 0, PeriodoRsi, PRICE_CLOSE, gSupB[0]);
         double rsi1 = iRSI(NULL, 0, PeriodoRsi, PRICE_CLOSE, gSupB[1]);
         if(gSup[0] < gSup[1] && rsi0 > rsi1)
            CriarSeta(PFX + "divA", Time[gSupB[0]], Low[gSupB[0]] - tol * 0.5, 241, clrLime);
        }
     }

   //--- PAINEL DE DECISAO -------------------------------------------
   if(MostrarPainel) DesenharPainel();
  }
//+------------------------------------------------------------------+
string Rotulo(int f)
  {
   if(f >= 3) return("forte");
   if(f == 2) return("media");
   return("fraca");
  }
//+------------------------------------------------------------------+
void CriarZona(string nome, datetime t1, double p1, datetime t2, double p2, color cor, bool forte)
  {
   ObjectCreate(0, nome, OBJ_RECTANGLE, 0, t1, p1, t2, p2);
   ObjectSetInteger(0, nome, OBJPROP_COLOR, cor);
   ObjectSetInteger(0, nome, OBJPROP_STYLE, forte ? STYLE_SOLID : STYLE_DOT);
   ObjectSetInteger(0, nome, OBJPROP_WIDTH, 1);
   ObjectSetInteger(0, nome, OBJPROP_BACK, true);
   ObjectSetInteger(0, nome, OBJPROP_SELECTABLE, false);
  }
//+------------------------------------------------------------------+
void CriarLinha(string nome, datetime t1, double p1, datetime t2, double p2, color cor)
  {
   ObjectCreate(0, nome, OBJ_TREND, 0, t1, p1, t2, p2);
   ObjectSetInteger(0, nome, OBJPROP_COLOR, cor);
   ObjectSetInteger(0, nome, OBJPROP_STYLE, STYLE_DASH);
   ObjectSetInteger(0, nome, OBJPROP_WIDTH, 1);
   ObjectSetInteger(0, nome, OBJPROP_RAY_RIGHT, false);
   ObjectSetInteger(0, nome, OBJPROP_BACK, true);
   ObjectSetInteger(0, nome, OBJPROP_SELECTABLE, false);
  }
//+------------------------------------------------------------------+
void CriarFib(string nome, datetime t1, double p, datetime t2, color cor)
  {
   ObjectCreate(0, nome, OBJ_TREND, 0, t1, p, t2, p);
   ObjectSetInteger(0, nome, OBJPROP_COLOR, cor);
   ObjectSetInteger(0, nome, OBJPROP_STYLE, STYLE_DOT);
   ObjectSetInteger(0, nome, OBJPROP_WIDTH, 1);
   ObjectSetInteger(0, nome, OBJPROP_RAY_RIGHT, false);
   ObjectSetInteger(0, nome, OBJPROP_BACK, true);
   ObjectSetInteger(0, nome, OBJPROP_SELECTABLE, false);
  }
//+------------------------------------------------------------------+
void CriarTexto(string nome, datetime t, double p, string txt, color cor)
  {
   ObjectCreate(0, nome, OBJ_TEXT, 0, t, p);
   ObjectSetString(0, nome, OBJPROP_TEXT, txt);
   ObjectSetInteger(0, nome, OBJPROP_COLOR, cor);
   ObjectSetInteger(0, nome, OBJPROP_FONTSIZE, 8);
   ObjectSetInteger(0, nome, OBJPROP_SELECTABLE, false);
  }
//+------------------------------------------------------------------+
void CriarSeta(string nome, datetime t, double p, int codigo, color cor)
  {
   ObjectCreate(0, nome, OBJ_ARROW, 0, t, p);
   ObjectSetInteger(0, nome, OBJPROP_ARROWCODE, codigo);
   ObjectSetInteger(0, nome, OBJPROP_COLOR, cor);
   ObjectSetInteger(0, nome, OBJPROP_WIDTH, 1);
   ObjectSetInteger(0, nome, OBJPROP_SELECTABLE, false);
  }
//+------------------------------------------------------------------+
void PainelLinha(string nome, int linha, string txt, color cor, int tam)
  {
   string n = PFX + "pnl" + nome;
   ObjectCreate(0, n, OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, n, OBJPROP_CORNER, CORNER_RIGHT_UPPER);
   ObjectSetInteger(0, n, OBJPROP_XDISTANCE, PainelX);
   ObjectSetInteger(0, n, OBJPROP_YDISTANCE, PainelY + linha * 15);
   ObjectSetInteger(0, n, OBJPROP_ANCHOR, ANCHOR_RIGHT_UPPER);
   ObjectSetInteger(0, n, OBJPROP_COLOR, cor);
   ObjectSetInteger(0, n, OBJPROP_FONTSIZE, tam);
   ObjectSetString(0, n, OBJPROP_FONT, "Consolas");
   ObjectSetString(0, n, OBJPROP_TEXT, txt);
   ObjectSetInteger(0, n, OBJPROP_SELECTABLE, false);
  }
//+------------------------------------------------------------------+
void DesenharPainel()
  {
   color corSem = (gSemaforo == "ENTRAR") ? clrLime : ((gSemaforo == "EVITAR") ? clrRed : clrOrange);
   color corSelo = (gSelo == "A") ? clrLime : ((gSelo == "B") ? clrOrange : clrRed);
   string dir = gTemSinal ? ((gDirDom == 1) ? "  CALL" : "  PUT") : "";

   PainelLinha("0", 0, ">> " + gSemaforo + " <<", corSem, 12);
   PainelLinha("1", 1, gSemMotivo, corSem, 8);
   PainelLinha("2", 2, "Selo: " + gSelo + dir, corSelo, 9);
   PainelLinha("3", 3, "Confluencia: " + (string)gScoreL + " CALL / " + (string)gScoreS + " PUT  (min "
                  + (string)gAlvo + "/" + (string)gHabilitados + ")", clrWhite, 8);
   PainelLinha("4", 4, "TF maior " + TfNome(TfEfetivo()) + ": "
                  + ((gHtfDir == 1) ? "alta" : ((gHtfDir == -1) ? "baixa" : "neutro")),
                  (gHtfDir == 1) ? clrLime : ((gHtfDir == -1) ? clrRed : clrSilver), 8);
   PainelLinha("5", 5, "Estrutura: " + gEstrutura,
                  (gEstrDir == 1) ? clrLime : ((gEstrDir == -1) ? clrRed : clrSilver), 8);
   PainelLinha("6", 6, "Zonas: R " + (string)gForcaRes + "x  /  S " + (string)gForcaSup + "x", clrWhite, 8);
   PainelLinha("7", 7, "Sessao: " + (gNaSessao ? "forte" : "fraca"), gNaSessao ? clrLime : clrRed, 8);
   PainelLinha("8", 8, "ESTUDO - nao e recomendacao", clrGoldenrod, 8);
  }
//+------------------------------------------------------------------+
//| ALERTAS (popup + push no celular) na virada da vela               |
//+------------------------------------------------------------------+
void Alertar()
  {
   if(Time[0] == gUltimoAlerta) return;

   int b = 1;                         // ultima vela FECHADA
   string tipo = "";
   if(BufCallA[b] != 0.0)      tipo = "CALL NIVEL A";
   else if(BufPutA[b]  != 0.0) tipo = "PUT NIVEL A";
   else if(AlertarNivelB && BufCallB[b] != 0.0) tipo = "CALL nivel B";
   else if(AlertarNivelB && BufPutB[b]  != 0.0) tipo = "PUT nivel B";
   if(tipo == "") return;

   gUltimoAlerta = Time[0];
   string msg = "QUANT OPS: " + tipo + " em " + Symbol() + " " + TfNome(Period())
              + " | semaforo: " + gSemaforo + " | ESTUDO, nao e recomendacao.";
   if(AlertaPopup) Alert(msg);
   if(AlertaPush)  SendNotification(msg);
   if(AlertaSom)   PlaySound("alert.wav");
  }
//+------------------------------------------------------------------+
