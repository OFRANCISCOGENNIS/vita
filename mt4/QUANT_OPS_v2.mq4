//+------------------------------------------------------------------+
//|  QUANT_OPS_v2.mq4                                                 |
//|  QUANT OPS v2 - Confluencia + Price Action + Semaforo             |
//|  Porte refinado do app QUANT OPS / do indicador Pine para MT4     |
//+------------------------------------------------------------------+
//  ============================ AVISO =============================
//  FERRAMENTA DE ESTUDO. Nao e recomendacao de investimento.
//  Operacao alavancada (CFD/forex) e de risco altissimo: spread, swap,
//  comissao e slippage corroem qualquer vantagem estatistica. O painel
//  de evidencia deste indicador mede o comportamento BRUTO do preco -
//  ele NAO desconta custos. Valide em conta DEMO por tempo suficiente
//  antes de qualquer uso com dinheiro real.
//  =================================================================
//
//  O QUE FAZ (tudo ja ligado por padrao):
//    - Confluencia multi-fator: tendencia (EMA rapida x lenta), EMA200,
//      RSI, ATR, estrutura, MACD, Bandas de Bollinger e padrao de vela
//    - Portoes de contexto: multi-timeframe duplo, sessao forte,
//      distancia de S/R, Price Action (so no TESTE da zona), spread
//      maximo e janela de rollover
//    - Zonas de S/R (2 por lado) com FORCA por numero de toques
//    - Fibonacci automatico da ultima perna (38.2 / 50 / 61.8)
//    - LTA / LTB automaticas por pivos
//    - Divergencias RSI x preco
//    - Selo A / B / C e SEMAFORO (ENTRAR / ESPERAR / EVITAR)
//    - ENTRADAS NIVEL A e B com alerta e push no celular
//    - PAINEL DE EVIDENCIA: acerto historico por nivel, limite inferior
//      de Wilson (95%) e expectativa em R - a prova de que o sinal
//      tem (ou nao tem) vantagem no historico visivel
//    - GESTAO DE RISCO: stop/alvo por ATR e lote sugerido pelo risco %
//
//  SEM REPINTURA: um pivo so e considerado ForcaPivo velas depois de
//  acontecer - exatamente como o mercado o confirmaria em tempo real.
//  As setas sao gravadas apenas em velas FECHADAS (SoNoFechamento).
//
//  LIMITE HONESTO: o MetaTrader nao roda a IA de otimizacao nem o
//  registro de calibracao do app web - isso continua sendo do app.
//+------------------------------------------------------------------+
#property copyright "QUANT OPS - ferramenta de estudo"
#property link      "https://github.com/OFRANCISCOGENNIS"
#property version   "2.10"
#property strict
#property description "QUANT OPS v2.1 - confluencia + price action + semaforo + evidencia. ESTUDO, nao e recomendacao."
#property indicator_chart_window
#property indicator_buffers 7

#property indicator_color1 clrDodgerBlue
#property indicator_color2 clrOrange
#property indicator_color3 clrMediumPurple
#property indicator_color4 clrLime
#property indicator_color5 clrRed
#property indicator_color6 clrGold
#property indicator_color7 clrCrimson

//====================================================================
//  1) FATORES DE CONFLUENCIA
//====================================================================
extern string  _s1_          = "===== 1) FATORES DE CONFLUENCIA =====";
extern bool    UsarTendencia = true;   // Tendencia (EMA rapida x lenta)
extern int     EmaRapida     = 9;      // EMA rapida
extern int     EmaLenta      = 21;     // EMA lenta
extern bool    UsarEma200    = true;   // EMA 200 (vies macro)
extern int     PeriodoEma200 = 200;    // Periodo da EMA 200
extern bool    UsarRsi       = true;   // RSI (saida de sobrevenda/sobrecompra)
extern int     PeriodoRsi    = 14;     // Periodo do RSI
extern int     RsiSobrevenda = 30;     // Nivel de sobrevenda
extern int     RsiSobrecompra= 70;     // Nivel de sobrecompra
extern bool    UsarAtr       = true;   // ATR (volatilidade acima da media)
extern int     PeriodoAtr    = 14;     // Periodo do ATR
extern int     MediaAtr      = 50;     // Media do ATR
extern bool    UsarEstrutura = true;   // Estrutura (rompimento de topo/fundo)
extern int     LookbackEstr  = 20;     // Lookback da estrutura
extern bool    UsarMacd      = true;   // MACD (momentum)
extern bool    UsarBollinger = true;   // Bandas de Bollinger (2 sigma)
extern bool    UsarPadraoVela= true;   // Padrao de vela (engolfo / martelo)

//====================================================================
//  2) CONFLUENCIA
//====================================================================
extern string  _s2_          = "===== 2) CONFLUENCIA =====";
extern int     MinimoFatores = 4;      // Minimo de fatores a favor (4 = equilibrio do app)
extern int     Cooldown      = 5;      // Cooldown (velas entre sinais)
extern bool    SoNoFechamento= true;   // So sinaliza na vela FECHADA (recomendado)

//====================================================================
//  3) PORTOES DE CONTEXTO
//====================================================================
extern string  _s3_          = "===== 3) PORTOES (CONTEXTO) =====";
extern bool    UsarMtf       = true;   // Multi-timeframe: so a favor do TF maior
extern ENUM_TIMEFRAMES TfMaior  = PERIOD_CURRENT; // TF maior (CURRENT = automatico ~5x)
extern bool    ExigirMtfDuplo= false;  // Exigir tambem o 2o TF maior a favor
extern bool    UsarSessao    = true;   // So nas sessoes fortes (Londres/NY)
extern int     SessaoInicio  = 7;      // Hora inicial (hora do SERVIDOR)
extern int     SessaoFim     = 21;     // Hora final (hora do SERVIDOR)
extern bool    UsarSr        = true;   // Vetar entrada colada em S/R contrario
extern double  SrDistAtrMin  = 0.5;    // Distancia minima de S/R (x ATR)
extern bool    UsarPriceAction=true;   // Price Action: so entrar no TESTE de zona
extern double  PaDistAtrMax  = 0.8;    // Distancia maxima da zona (x ATR)
extern int     SpreadMaximo  = 0;      // Spread maximo em POINTS (0 = sem limite)
extern int     EvitarRolloverMin = 0;  // Minutos evitados em volta da virada do dia (0 = off)

//====================================================================
//  4) PRICE ACTION & VISUAL
//====================================================================
extern string  _s4_          = "===== 4) PRICE ACTION & VISUAL =====";
extern int     ForcaPivo     = 5;      // Forca do pivo (barras de cada lado)
extern bool    MostrarZonas  = true;   // Zonas de S/R (2 por lado)
extern bool    MostrarLt     = true;   // LTA / LTB automaticas
extern bool    MostrarFib    = true;   // Fibonacci automatico (38.2 / 50 / 61.8)
extern int     FibLookback   = 120;    // Lookback da perna do Fibonacci
extern bool    MostrarDiv    = true;   // Divergencias RSI x preco
extern bool    MostrarPainel = true;   // Painel de decisao (semaforo)
extern bool    PainelCompacto= false;  // Painel compacto (esconde evidencia/risco)
extern int     PainelX       = 10;     // Painel - distancia da borda direita
extern int     PainelY       = 20;     // Painel - distancia do topo
extern int     PainelFonte   = 8;      // Painel - tamanho da fonte

//====================================================================
//  5) EVIDENCIA (backtest embutido do proprio sinal)
//====================================================================
extern string  _s5_          = "===== 5) EVIDENCIA =====";
extern bool    MedirEvidencia= true;   // Medir acerto historico dos sinais
extern int     VelasAvaliacao= 5;      // Velas ate avaliar o resultado do sinal
extern bool    ExigirEvidencia=false;  // So ENTRAR se a evidencia superar o break-even

//====================================================================
//  6) GESTAO DE RISCO
//====================================================================
extern string  _s6_          = "===== 6) GESTAO DE RISCO =====";
extern bool    MostrarRisco  = true;   // Calcular stop/alvo e lote sugerido
extern double  RiscoPorTrade = 1.0;    // Risco por operacao (% do saldo)
extern double  MultStopAtr   = 1.5;    // Stop = ATR x
extern double  MultAlvoAtr   = 2.0;    // Alvo = ATR x

//====================================================================
//  7) ALERTAS
//====================================================================
extern string  _s7_          = "===== 7) ALERTAS =====";
extern bool    AlertaPopup   = true;   // Alerta na tela do MetaTrader
extern bool    AlertaPush    = true;   // Push no celular (MetaTrader mobile)
extern bool    AlertaSom     = true;   // Som
extern bool    AlertarNivelB = true;   // Alertar tambem o nivel B

//====================================================================
//  8) DESEMPENHO
//====================================================================
extern string  _s8_          = "===== 8) DESEMPENHO =====";
extern int     MaxBarras     = 1500;   // Maximo de velas calculadas
extern int     RedesenhoMs   = 350;    // Intervalo minimo de redesenho (ms)

//====================================================================
//  BUFFERS
//====================================================================
double BufEmaR[];     // 0
double BufEmaL[];     // 1
double BufEma200[];   // 2
double BufCallA[];    // 3
double BufPutA[];     // 4
double BufCallB[];    // 5
double BufPutB[];     // 6
double BufAtr[];      // 7 - calculo apenas (evita 50 chamadas de iATR por vela)

//====================================================================
//  CONSTANTES
//====================================================================
#define PFX        "QO_"
#define MAXPIV     96      // pivos guardados em cache por lado
#define USAR_PIV   12      // pivos usados nas zonas / LT
#define Z_WILSON   1.96    // 95% de confianca

#define SEL_C      0
#define SEL_B      1
#define SEL_A      2

#define SEM_EVITAR   0
#define SEM_ESPERAR  1
#define SEM_ENTRAR   2

#define MOT_SESSAO     0
#define MOT_MTF        1
#define MOT_SELOC      2
#define MOT_SEMCONF    3
#define MOT_PA         4
#define MOT_SPREAD     5
#define MOT_ROLLOVER   6
#define MOT_EVIDENCIA  7
#define MOT_GRAU       8
#define MOT_ENTRAR     9

//====================================================================
//  ESTADO
//====================================================================
// Contexto calculado por vela. Struct so com numeros (os textos sao
// derivados dos codigos) - mantem o calculo isolado do desenho.
struct Ctx
  {
   int      scoreL, scoreS, habil, alvo;
   int      dirDom;              // 1 = CALL dominante, -1 = PUT
   int      htfDir, htf2Dir;
   int      selo;                // SEL_A / SEL_B / SEL_C
   int      estrDir;             // 1 alta, -1 baixa, 0 lateral
   int      estrTipo;            // 0 indef, 1 HH+HL, 2 LH+LL, 3 compressao, 4 expansao
   int      forcaRes, forcaSup;
   int      semaforo, motivo;
   double   atr, atrMed;
   double   resProx, supProx;
   double   distZonaAtr;         // distancia da zona a favor, em ATR
   bool     sess, srOk, paOk, mtfOk, spreadOk, rolloverOk;
   bool     brutoL, brutoS, sinalL, sinalS;
  };

Ctx ctxAtual;

// --- cache de pivos (append-only, indice 0 = mais antigo do cache) ---
double   cTopoP[MAXPIV];   datetime cTopoT[MAXPIV];   int cTopoN  = 0;
double   cFundoP[MAXPIV];  datetime cFundoT[MAXPIV];  int cFundoN = 0;
datetime ultTopoReg = 0, ultFundoReg = 0;

// --- evidencia ---
int      evNA = 0, evWA = 0, evNB = 0, evWB = 0;
double   evLbA = 0, evLbB = 0;

// --- controle ---
datetime ultimoAlerta   = 0;
datetime ultimaBarra    = 0;
uint     ultimoRedesenho= 0;
int      tfEfe = 0, tf2Efe = 0;
bool     temaClaro = false;
string   nomeCurto = "QUANT OPS v2.1";

//====================================================================
//  INIT / DEINIT
//====================================================================
int OnInit()
  {
   ValidarEntradas();

   IndicatorBuffers(8);
   IndicatorShortName(nomeCurto);
   IndicatorDigits(Digits);

   SetIndexBuffer(0, BufEmaR);   SetIndexStyle(0, DRAW_LINE, STYLE_SOLID, 1);  SetIndexLabel(0, "EMA " + IntegerToString(EmaRapida));
   SetIndexBuffer(1, BufEmaL);   SetIndexStyle(1, DRAW_LINE, STYLE_SOLID, 1);  SetIndexLabel(1, "EMA " + IntegerToString(EmaLenta));
   SetIndexBuffer(2, BufEma200); SetIndexStyle(2, DRAW_LINE, STYLE_SOLID, 2);  SetIndexLabel(2, "EMA " + IntegerToString(PeriodoEma200));

   SetIndexBuffer(3, BufCallA);  SetIndexStyle(3, DRAW_ARROW, EMPTY, 3); SetIndexArrow(3, 233); SetIndexEmptyValue(3, 0.0); SetIndexLabel(3, "CALL nivel A");
   SetIndexBuffer(4, BufPutA);   SetIndexStyle(4, DRAW_ARROW, EMPTY, 3); SetIndexArrow(4, 234); SetIndexEmptyValue(4, 0.0); SetIndexLabel(4, "PUT nivel A");
   SetIndexBuffer(5, BufCallB);  SetIndexStyle(5, DRAW_ARROW, EMPTY, 1); SetIndexArrow(5, 233); SetIndexEmptyValue(5, 0.0); SetIndexLabel(5, "CALL nivel B");
   SetIndexBuffer(6, BufPutB);   SetIndexStyle(6, DRAW_ARROW, EMPTY, 1); SetIndexArrow(6, 234); SetIndexEmptyValue(6, 0.0); SetIndexLabel(6, "PUT nivel B");

   SetIndexBuffer(7, BufAtr);    SetIndexStyle(7, DRAW_NONE);            SetIndexLabel(7, "");

   tfEfe  = (TfMaior != PERIOD_CURRENT) ? (int)TfMaior : ProximoTf(Period());
   if(tfEfe <= Period()) tfEfe = ProximoTf(Period());   // TF maior tem de ser MAIOR
   tf2Efe = ProximoTf(tfEfe);
   temaClaro = TemaClaro();

   ResetarCache();
   return(INIT_SUCCEEDED);
  }
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   LimparObjetos();
   Comment("");
   ChartRedraw();
  }
//+------------------------------------------------------------------+
//| Corrige valores impossiveis em vez de deixar o indicador quebrar  |
//+------------------------------------------------------------------+
void ValidarEntradas()
  {
   if(EmaRapida     < 1)   EmaRapida     = 1;
   if(EmaLenta      < 2)   EmaLenta      = 2;
   if(EmaLenta      <= EmaRapida) EmaLenta = EmaRapida + 1;
   if(PeriodoEma200 < 1)   PeriodoEma200 = 1;
   if(PeriodoRsi    < 2)   PeriodoRsi    = 2;
   if(PeriodoAtr    < 1)   PeriodoAtr    = 1;
   if(MediaAtr      < 2)   MediaAtr      = 2;
   if(LookbackEstr  < 2)   LookbackEstr  = 2;
   if(ForcaPivo     < 2)   ForcaPivo     = 2;
   if(FibLookback   < 20)  FibLookback   = 20;
   if(MinimoFatores < 1)   MinimoFatores = 1;
   if(MinimoFatores > 8)   MinimoFatores = 8;
   if(Cooldown      < 0)   Cooldown      = 0;
   if(MaxBarras     < 200) MaxBarras     = 200;
   if(RedesenhoMs   < 0)   RedesenhoMs   = 0;
   if(VelasAvaliacao< 1)   VelasAvaliacao= 1;
   if(RiscoPorTrade <= 0)  RiscoPorTrade = 0.5;
   if(RiscoPorTrade > 10)  RiscoPorTrade = 10;      // trava de sanidade
   if(MultStopAtr   <= 0)  MultStopAtr   = 1.0;
   if(MultAlvoAtr   <= 0)  MultAlvoAtr   = 1.0;
   if(PainelFonte   < 6)   PainelFonte   = 6;
   if(SrDistAtrMin  < 0)   SrDistAtrMin  = 0;
   if(PaDistAtrMax  <= 0)  PaDistAtrMax  = 0.1;
   if(SessaoInicio  < 0 || SessaoInicio > 23) SessaoInicio = 0;
   if(SessaoFim     < 0 || SessaoFim    > 23) SessaoFim    = 23;
  }
//+------------------------------------------------------------------+
void ResetarCache()
  {
   cTopoN = 0;  cFundoN = 0;
   ultTopoReg = 0;  ultFundoReg = 0;
   evNA = 0; evWA = 0; evNB = 0; evWB = 0;
   evLbA = 0; evLbB = 0;
  }
//+------------------------------------------------------------------+
void LimparObjetos()
  {
   int n = StringLen(PFX);
   for(int i = ObjectsTotal() - 1; i >= 0; i--)
     {
      string nome = ObjectName(i);
      if(StringSubstr(nome, 0, n) == PFX) ObjectDelete(nome);
     }
  }
//+------------------------------------------------------------------+
//| Fundo claro? (o painel troca de paleta para continuar legivel)    |
//+------------------------------------------------------------------+
bool TemaClaro()
  {
   long bg = ChartGetInteger(0, CHART_COLOR_BACKGROUND);
   int  r  = (int)(bg & 0xFF);
   int  g  = (int)((bg >> 8) & 0xFF);
   int  b  = (int)((bg >> 16) & 0xFF);
   return(((r + g + b) / 3) > 128);
  }
//+------------------------------------------------------------------+
color CorTexto()  { return(temaClaro ? clrBlack : clrWhiteSmoke); }
color CorFraca()  { return(temaClaro ? clrDimGray : clrSilver);   }
color CorFundo()  { return(temaClaro ? clrWhiteSmoke : C'14,20,30'); }
color CorAlta()   { return(temaClaro ? clrGreen : clrLime);       }
color CorBaixa()  { return(temaClaro ? clrFireBrick : clrTomato); }

//====================================================================
//  TIMEFRAMES
//====================================================================
//| Proximo degrau de timeframe (aprox. 4-5x)                         |
int ProximoTf(int base)
  {
   switch(base)
     {
      case PERIOD_M1:  return(PERIOD_M5);
      case PERIOD_M5:  return(PERIOD_M15);
      case PERIOD_M15: return(PERIOD_H1);
      case PERIOD_M30: return(PERIOD_H4);
      case PERIOD_H1:  return(PERIOD_H4);
      case PERIOD_H4:  return(PERIOD_D1);
      case PERIOD_D1:  return(PERIOD_W1);
      case PERIOD_W1:  return(PERIOD_MN1);
     }
   return(PERIOD_MN1);
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
//| Direcao do TF maior na vela i (com guarda de historico ausente)   |
//+------------------------------------------------------------------+
int DirecaoHtf(int tf, int i)
  {
   int hs = iBarShift(NULL, tf, Time[i], false);
   if(hs < 0) return(0);                       // historico do TF nao carregado
   double r = iMA(NULL, tf, EmaRapida, 0, MODE_EMA, PRICE_CLOSE, hs);
   double l = iMA(NULL, tf, EmaLenta,  0, MODE_EMA, PRICE_CLOSE, hs);
   if(r <= 0 || l <= 0) return(0);
   return(r > l ? 1 : (r < l ? -1 : 0));
  }

//====================================================================
//  PIVOS - cache incremental (O(1) por vela em vez de varrer o passado)
//====================================================================
bool EhPivoAlto(int j)
  {
   if(j - ForcaPivo < 0 || j + ForcaPivo >= Bars) return(false);
   double h = High[j];
   for(int k = 1; k <= ForcaPivo; k++)
      if(High[j - k] > h || High[j + k] > h) return(false);
   return(true);
  }
//+------------------------------------------------------------------+
bool EhPivoBaixo(int j)
  {
   if(j - ForcaPivo < 0 || j + ForcaPivo >= Bars) return(false);
   double l = Low[j];
   for(int k = 1; k <= ForcaPivo; k++)
      if(Low[j - k] < l || Low[j + k] < l) return(false);
   return(true);
  }
//+------------------------------------------------------------------+
void EmpilharTopo(double p, datetime t)
  {
   if(cTopoN >= MAXPIV)
     {
      for(int k = 1; k < MAXPIV; k++) { cTopoP[k-1] = cTopoP[k]; cTopoT[k-1] = cTopoT[k]; }
      cTopoN = MAXPIV - 1;
     }
   cTopoP[cTopoN] = p;  cTopoT[cTopoN] = t;  cTopoN++;
   ultTopoReg = t;
  }
//+------------------------------------------------------------------+
void EmpilharFundo(double p, datetime t)
  {
   if(cFundoN >= MAXPIV)
     {
      for(int k = 1; k < MAXPIV; k++) { cFundoP[k-1] = cFundoP[k]; cFundoT[k-1] = cFundoT[k]; }
      cFundoN = MAXPIV - 1;
     }
   cFundoP[cFundoN] = p;  cFundoT[cFundoN] = t;  cFundoN++;
   ultFundoReg = t;
  }
//+------------------------------------------------------------------+
//| Na vela i ja se conhece o pivo da vela i+ForcaPivo - e SO ele.    |
//| Registrar assim mantem o indicador livre de repintura.            |
//+------------------------------------------------------------------+
void RegistrarPivos(int i)
  {
   int j = i + ForcaPivo;
   if(j >= Bars) return;
   if(EhPivoAlto(j)  && Time[j] > ultTopoReg)  EmpilharTopo(High[j], Time[j]);
   if(EhPivoBaixo(j) && Time[j] > ultFundoReg) EmpilharFundo(Low[j], Time[j]);
  }
//+------------------------------------------------------------------+
// Acesso "de tras pra frente": 0 = pivo mais recente conhecido
double TopoRec(int k)    { return(k < cTopoN  ? cTopoP[cTopoN  - 1 - k] : 0.0); }
double FundoRec(int k)   { return(k < cFundoN ? cFundoP[cFundoN - 1 - k] : 0.0); }
datetime TopoRecT(int k) { return(k < cTopoN  ? cTopoT[cTopoN  - 1 - k] : 0);   }
datetime FundoRecT(int k){ return(k < cFundoN ? cFundoT[cFundoN - 1 - k] : 0);  }
//+------------------------------------------------------------------+
//| Forca da zona = quantos pivos recentes caem dentro de +/- tol     |
//+------------------------------------------------------------------+
int ContaToquesTopo(double nivel, double tol)
  {
   int c = 0, lim = MathMin(cTopoN, USAR_PIV);
   for(int k = 0; k < lim; k++) if(MathAbs(TopoRec(k) - nivel) <= tol) c++;
   return(c);
  }
int ContaToquesFundo(double nivel, double tol)
  {
   int c = 0, lim = MathMin(cFundoN, USAR_PIV);
   for(int k = 0; k < lim; k++) if(MathAbs(FundoRec(k) - nivel) <= tol) c++;
   return(c);
  }
//+------------------------------------------------------------------+
//| Segundo nivel DISTINTO (fora da tolerancia do primeiro)           |
//+------------------------------------------------------------------+
double SegundoTopo(double primeiro, double tol)
  {
   int lim = MathMin(cTopoN, USAR_PIV);
   for(int k = 1; k < lim; k++) if(MathAbs(TopoRec(k) - primeiro) > tol) return(TopoRec(k));
   return(0.0);
  }
double SegundoFundo(double primeiro, double tol)
  {
   int lim = MathMin(cFundoN, USAR_PIV);
   for(int k = 1; k < lim; k++) if(MathAbs(FundoRec(k) - primeiro) > tol) return(FundoRec(k));
   return(0.0);
  }

//====================================================================
//  PORTOES AUXILIARES
//====================================================================
bool NaSessao(int i)
  {
   if(!UsarSessao) return(true);
   if(SessaoInicio == SessaoFim) return(true);
   int h = TimeHour(Time[i]);
   if(SessaoInicio < SessaoFim) return(h >= SessaoInicio && h < SessaoFim);
   return(h >= SessaoInicio || h < SessaoFim);          // janela cruzando a meia-noite
  }
//+------------------------------------------------------------------+
//| Rollover: a virada do dia do servidor tem spread alargado e       |
//| liquidez rala - o pior momento possivel para entrar.              |
//+------------------------------------------------------------------+
bool ForaDoRollover(int i)
  {
   if(EvitarRolloverMin <= 0) return(true);
   int mins = TimeHour(Time[i]) * 60 + TimeMinute(Time[i]);
   int dist = MathMin(mins, 1440 - mins);               // distancia ate 00:00
   return(dist >= EvitarRolloverMin);
  }
//+------------------------------------------------------------------+
//| Spread so e verificavel AO VIVO. No historico nao ha registro,    |
//| entao o portao vale apenas para as velas recentes - e o painel    |
//| diz isso com todas as letras.                                     |
//+------------------------------------------------------------------+
bool SpreadOk(int i)
  {
   if(SpreadMaximo <= 0) return(true);
   if(i > 1) return(true);
   return((int)MarketInfo(Symbol(), MODE_SPREAD) <= SpreadMaximo);
  }
//+------------------------------------------------------------------+
//| Cooldown lido dos proprios buffers: imune a recalculo parcial     |
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
//| Media do ATR lida do buffer de calculo (sem re-chamar o iATR)     |
//+------------------------------------------------------------------+
double AtrMedio(int i)
  {
   double s = 0;
   int    n = 0;
   for(int k = 0; k < MediaAtr; k++)
     {
      int j = i + k;
      if(j >= Bars) break;
      if(BufAtr[j] <= 0) continue;
      s += BufAtr[j];
      n++;
     }
   return(n > 0 ? s / n : 0.0);
  }

//====================================================================
//  CALCULO PRINCIPAL
//====================================================================
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
      // Buffers de linha vao para EMPTY_VALUE (e nao 0) para nao desenhar
      // uma reta no rodape do grafico nas velas fora do alcance de calculo.
      ArrayInitialize(BufEmaR,   EMPTY_VALUE);
      ArrayInitialize(BufEmaL,   EMPTY_VALUE);
      ArrayInitialize(BufEma200, EMPTY_VALUE);
      ArrayInitialize(BufCallA,  0.0);
      ArrayInitialize(BufPutA,   0.0);
      ArrayInitialize(BufCallB,  0.0);
      ArrayInitialize(BufPutB,   0.0);
      ArrayInitialize(BufAtr,    0.0);
      ResetarCache();
      limite = MathMin(rates_total - minimo, MaxBarras);
     }
   else
      limite = MathMin(rates_total - prev_calculated + 1, MaxBarras);
   if(limite < 0) limite = 0;

   // ATR precisa existir ANTES do trecho recalculado para a media fechar
   for(int k = limite + MediaAtr + 2; k > limite; k--)
      if(k < rates_total && BufAtr[k] <= 0) BufAtr[k] = iATR(NULL, 0, PeriodoAtr, k);

   for(int i = limite; i >= 0; i--)
     {
      BufAtr[i]    = iATR(NULL, 0, PeriodoAtr, i);
      BufEmaR[i]   = iMA(NULL, 0, EmaRapida,     0, MODE_EMA, PRICE_CLOSE, i);
      BufEmaL[i]   = iMA(NULL, 0, EmaLenta,      0, MODE_EMA, PRICE_CLOSE, i);
      BufEma200[i] = UsarEma200 ? iMA(NULL, 0, PeriodoEma200, 0, MODE_EMA, PRICE_CLOSE, i) : EMPTY_VALUE;

      BufCallA[i] = 0.0;  BufPutA[i] = 0.0;
      BufCallB[i] = 0.0;  BufPutB[i] = 0.0;

      RegistrarPivos(i);                       // cache avanca uma vela por vez

      if(i == 0 && SoNoFechamento) continue;   // vela em formacao nao grava seta

      Avaliar(i, ctxAtual);
      GravarSetas(i, ctxAtual);
     }

   //--- contexto vivo da vela atual (para o painel), sempre recalculado
   Avaliar(0, ctxAtual);

   // Evidencia e desenho pagam o mesmo throttle: sao a parte cara e nao
   // mudam de forma perceptivel entre dois ticks do mesmo segundo.
   bool redesenhar = PodeRedesenhar();
   if(redesenhar && MedirEvidencia) MedirAcerto(MathMin(MaxBarras, rates_total - 2));
   AplicarEvidenciaNoSemaforo(ctxAtual);

   if(redesenhar)
     {
      Desenhar(ctxAtual);
      ChartRedraw();
     }
   Alertar();

   return(rates_total);
  }
//+------------------------------------------------------------------+
//| Throttle de desenho: em tempo real chegam dezenas de ticks por    |
//| segundo e redesenhar tudo em cada um so serve para travar o MT4.  |
//+------------------------------------------------------------------+
bool PodeRedesenhar()
  {
   if(Time[0] != ultimaBarra) { ultimaBarra = Time[0]; ultimoRedesenho = GetTickCount(); return(true); }
   uint agora = GetTickCount();
   if(agora - ultimoRedesenho >= (uint)RedesenhoMs) { ultimoRedesenho = agora; return(true); }
   return(false);
  }
//+------------------------------------------------------------------+
//| AVALIAR: fatores, portoes, selo e semaforo da vela i              |
//+------------------------------------------------------------------+
void Avaliar(int i, Ctx &c)
  {
   double emaR   = iMA(NULL, 0, EmaRapida,     0, MODE_EMA, PRICE_CLOSE, i);
   double emaL   = iMA(NULL, 0, EmaLenta,      0, MODE_EMA, PRICE_CLOSE, i);
   double ema200 = iMA(NULL, 0, PeriodoEma200, 0, MODE_EMA, PRICE_CLOSE, i);
   double rsi    = iRSI(NULL, 0, PeriodoRsi, PRICE_CLOSE, i);
   double rsiAnt = iRSI(NULL, 0, PeriodoRsi, PRICE_CLOSE, i + 1);
   double macdH  = iMACD(NULL, 0, 12, 26, 9, PRICE_CLOSE, MODE_MAIN,   i)
                 - iMACD(NULL, 0, 12, 26, 9, PRICE_CLOSE, MODE_SIGNAL, i);
   double macdHa = iMACD(NULL, 0, 12, 26, 9, PRICE_CLOSE, MODE_MAIN,   i + 1)
                 - iMACD(NULL, 0, 12, 26, 9, PRICE_CLOSE, MODE_SIGNAL, i + 1);
   double bbSup  = iBands(NULL, 0, 20, 2.0, 0, PRICE_CLOSE, MODE_UPPER, i);
   double bbInf  = iBands(NULL, 0, 20, 2.0, 0, PRICE_CLOSE, MODE_LOWER, i);

   c.atr    = (BufAtr[i] > 0) ? BufAtr[i] : iATR(NULL, 0, PeriodoAtr, i);
   c.atrMed = AtrMedio(i);
   if(c.atr <= 0) c.atr = Point;                    // simbolo sem volatilidade lida

   double px = Close[i], ab = Open[i], hi = High[i], lo = Low[i];

   //--- fatores -----------------------------------------------------
   bool fTendL  = (emaR > emaL),  fTendS  = (emaR < emaL);
   bool fMacroL = (px > ema200),  fMacroS = (px < ema200);
   bool fRsiL   = (rsiAnt <= RsiSobrevenda  && rsi > RsiSobrevenda);
   bool fRsiS   = (rsiAnt >= RsiSobrecompra && rsi < RsiSobrecompra);
   bool fAtr    = (c.atrMed > 0 && c.atr > c.atrMed);

   int shH = iHighest(NULL, 0, MODE_HIGH, LookbackEstr, i + 1);
   int shL = iLowest (NULL, 0, MODE_LOW,  LookbackEstr, i + 1);
   double maxRec = (shH >= 0) ? High[shH] : hi;
   double minRec = (shL >= 0) ? Low[shL]  : lo;
   bool fEstrL = (px > maxRec), fEstrS = (px < minRec);

   bool fMacdL = (macdH > 0 && macdH >= macdHa);
   bool fMacdS = (macdH < 0 && macdH <= macdHa);
   bool fBollL = (px < bbInf), fBollS = (px > bbSup);

   double corpo = MathAbs(px - ab);
   bool engolfoL = (px > ab && Close[i+1] < Open[i+1] && px >= Open[i+1] && ab <= Close[i+1]);
   bool engolfoS = (px < ab && Close[i+1] > Open[i+1] && px <= Open[i+1] && ab >= Close[i+1]);
   bool marteloL = ((hi - lo) > 0 && (MathMin(ab, px) - lo) > corpo * 2.0 && px > ab);
   bool marteloS = ((hi - lo) > 0 && (hi - MathMax(ab, px)) > corpo * 2.0 && px < ab);
   bool fPadL = (engolfoL || marteloL), fPadS = (engolfoS || marteloS);

   c.scoreL = 0; c.scoreS = 0; c.habil = 0;
   if(UsarTendencia)  { c.habil++; if(fTendL)  c.scoreL++; if(fTendS)  c.scoreS++; }
   if(UsarEma200)     { c.habil++; if(fMacroL) c.scoreL++; if(fMacroS) c.scoreS++; }
   if(UsarRsi)        { c.habil++; if(fRsiL)   c.scoreL++; if(fRsiS)   c.scoreS++; }
   if(UsarAtr)        { c.habil++; if(fAtr) { c.scoreL++; c.scoreS++; }            }
   if(UsarEstrutura)  { c.habil++; if(fEstrL)  c.scoreL++; if(fEstrS)  c.scoreS++; }
   if(UsarMacd)       { c.habil++; if(fMacdL)  c.scoreL++; if(fMacdS)  c.scoreS++; }
   if(UsarBollinger)  { c.habil++; if(fBollL)  c.scoreL++; if(fBollS)  c.scoreS++; }
   if(UsarPadraoVela) { c.habil++; if(fPadL)   c.scoreL++; if(fPadS)   c.scoreS++; }
   c.alvo = MathMin(MinimoFatores, c.habil);

   //--- zonas na vela i --------------------------------------------
   double tol = c.atr * 0.6;
   c.resProx  = TopoRec(0);
   c.supProx  = FundoRec(0);
   c.forcaRes = (c.resProx > 0) ? ContaToquesTopo(c.resProx, tol)  : 0;
   c.forcaSup = (c.supProx > 0) ? ContaToquesFundo(c.supProx, tol) : 0;

   //--- estrutura ---------------------------------------------------
   bool topoAlto  = (cTopoN  >= 2 && TopoRec(0)  > TopoRec(1));
   bool fundoAlto = (cFundoN >= 2 && FundoRec(0) > FundoRec(1));
   if(cTopoN < 2 || cFundoN < 2)      { c.estrTipo = 0; c.estrDir = 0;  }
   else if(topoAlto && fundoAlto)     { c.estrTipo = 1; c.estrDir = 1;  }
   else if(!topoAlto && !fundoAlto)   { c.estrTipo = 2; c.estrDir = -1; }
   else if(!topoAlto && fundoAlto)    { c.estrTipo = 3; c.estrDir = 0;  }
   else                               { c.estrTipo = 4; c.estrDir = 0;  }

   //--- portoes -----------------------------------------------------
   c.sess       = NaSessao(i);
   c.rolloverOk = ForaDoRollover(i);
   c.spreadOk   = SpreadOk(i);
   c.htfDir     = UsarMtf ? DirecaoHtf(tfEfe,  i) : 0;
   c.htf2Dir    = (UsarMtf && ExigirMtfDuplo) ? DirecaoHtf(tf2Efe, i) : 0;

   bool mtfOkL = (!UsarMtf || c.htfDir ==  1) && (!ExigirMtfDuplo || !UsarMtf || c.htf2Dir ==  1);
   bool mtfOkS = (!UsarMtf || c.htfDir == -1) && (!ExigirMtfDuplo || !UsarMtf || c.htf2Dir == -1);

   bool srOkL = (!UsarSr || c.resProx <= 0 || (c.resProx - px) > c.atr * SrDistAtrMin);
   bool srOkS = (!UsarSr || c.supProx <= 0 || (px - c.supProx) > c.atr * SrDistAtrMin);

   bool paOkL = (!UsarPriceAction || (c.supProx > 0 && MathAbs(px - c.supProx) <= c.atr * PaDistAtrMax));
   bool paOkS = (!UsarPriceAction || (c.resProx > 0 && MathAbs(px - c.resProx) <= c.atr * PaDistAtrMax));

   c.brutoL = (c.habil > 0 && c.scoreL >= c.alvo && c.scoreL > c.scoreS);
   c.brutoS = (c.habil > 0 && c.scoreS >= c.alvo && c.scoreS > c.scoreL);

   //--- selo A / B / C ----------------------------------------------
   c.dirDom     = (c.scoreL >= c.scoreS) ? 1 : -1;
   int scoreDom = (c.dirDom == 1) ? c.scoreL : c.scoreS;
   int exigA    = MathMax(1, (int)MathCeil(c.habil * 0.7));
   c.mtfOk      = (c.dirDom == 1) ? mtfOkL : mtfOkS;
   c.srOk       = (c.dirDom == 1) ? srOkL  : srOkS;
   c.paOk       = (c.dirDom == 1) ? paOkL  : paOkS;

   double zonaFav = (c.dirDom == 1) ? c.supProx : c.resProx;
   c.distZonaAtr  = (zonaFav > 0) ? MathAbs(px - zonaFav) / c.atr : -1;

   if(scoreDom >= exigA && c.mtfOk && c.srOk && c.sess)   c.selo = SEL_A;
   else if(scoreDom >= c.alvo && c.mtfOk && c.srOk)       c.selo = SEL_B;
   else                                                   c.selo = SEL_C;

   bool portoes = c.sess && c.rolloverOk && c.spreadOk && CooldownLivre(i);
   c.sinalL = (c.brutoL && portoes && mtfOkL && srOkL && paOkL);
   c.sinalS = (c.brutoS && portoes && mtfOkS && srOkS && paOkS && !c.sinalL);

   //--- SEMAFORO: a decisao unica (ENTRAR abre para selo A **ou B**) -
   bool temSinal  = (c.brutoL || c.brutoS);
   bool mtfContra = (UsarMtf && c.htfDir != 0 && c.htfDir == -c.dirDom);

   if(!c.sess)                          { c.semaforo = SEM_EVITAR;  c.motivo = MOT_SESSAO;   }
   else if(!c.rolloverOk)               { c.semaforo = SEM_EVITAR;  c.motivo = MOT_ROLLOVER; }
   else if(!c.spreadOk)                 { c.semaforo = SEM_EVITAR;  c.motivo = MOT_SPREAD;   }
   else if(mtfContra)                   { c.semaforo = SEM_EVITAR;  c.motivo = MOT_MTF;      }
   else if(c.selo == SEL_C && temSinal) { c.semaforo = SEM_EVITAR;  c.motivo = MOT_SELOC;    }
   else if(!temSinal)                   { c.semaforo = SEM_ESPERAR; c.motivo = MOT_SEMCONF;  }
   else if(!c.paOk)                     { c.semaforo = SEM_ESPERAR; c.motivo = MOT_PA;       }
   else if(c.selo == SEL_A || c.selo == SEL_B) { c.semaforo = SEM_ENTRAR; c.motivo = MOT_ENTRAR; }
   else                                 { c.semaforo = SEM_ESPERAR; c.motivo = MOT_GRAU;     }
  }
//+------------------------------------------------------------------+
void GravarSetas(int i, Ctx &c)
  {
   double desl = c.atr * 0.6;
   if(c.sinalL && c.selo == SEL_A) BufCallA[i] = Low[i]  - desl;
   if(c.sinalS && c.selo == SEL_A) BufPutA[i]  = High[i] + desl;
   if(c.sinalL && c.selo == SEL_B) BufCallB[i] = Low[i]  - desl;
   if(c.sinalS && c.selo == SEL_B) BufPutB[i]  = High[i] + desl;
  }

//====================================================================
//  EVIDENCIA - backtest do proprio sinal, no historico visivel
//====================================================================
// Mede so o que da para medir com honestidade: o preco andou a favor
// VelasAvaliacao velas depois do sinal? Sem custo, sem stop, sem alvo.
// E por isso que o painel mostra o LIMITE INFERIOR de Wilson: com
// amostra pequena a taxa crua mente, o limite inferior nao.
//+------------------------------------------------------------------+
double WilsonLb(int wins, int n)
  {
   if(n <= 0) return(0.0);
   double p   = (double)wins / (double)n;
   double z2  = Z_WILSON * Z_WILSON;
   double den = 1.0 + z2 / n;
   double cen = p + z2 / (2.0 * n);
   double mar = Z_WILSON * MathSqrt(p * (1.0 - p) / n + z2 / (4.0 * n * n));
   double lb  = (cen - mar) / den;
   return(lb < 0 ? 0 : (lb > 1 ? 1 : lb));
  }
//+------------------------------------------------------------------+
void MedirAcerto(int ate)
  {
   evNA = 0; evWA = 0; evNB = 0; evWB = 0;
   int fim = MathMin(ate, Bars - 2);
   for(int i = fim; i >= VelasAvaliacao + 1; i--)
     {
      double fut = Close[i - VelasAvaliacao];
      if(BufCallA[i] != 0.0) { evNA++; if(fut > Close[i]) evWA++; }
      if(BufPutA[i]  != 0.0) { evNA++; if(fut < Close[i]) evWA++; }
      if(BufCallB[i] != 0.0) { evNB++; if(fut > Close[i]) evWB++; }
      if(BufPutB[i]  != 0.0) { evNB++; if(fut < Close[i]) evWB++; }
     }
   evLbA = WilsonLb(evWA, evNA);
   evLbB = WilsonLb(evWB, evNB);
  }
//+------------------------------------------------------------------+
double BreakEven()   { return(MultStopAtr / (MultStopAtr + MultAlvoAtr)); }
//+------------------------------------------------------------------+
//| Expectativa em R usando o limite INFERIOR (cenario conservador)   |
//+------------------------------------------------------------------+
double ExpectativaR(double lb)
  {
   return(lb * MultAlvoAtr - (1.0 - lb) * MultStopAtr);
  }
//+------------------------------------------------------------------+
//| Portao opcional de evidencia: sem prova, nao abre o verde.        |
//+------------------------------------------------------------------+
void AplicarEvidenciaNoSemaforo(Ctx &c)
  {
   if(!ExigirEvidencia || !MedirEvidencia) return;
   if(c.semaforo != SEM_ENTRAR) return;
   int    n  = (c.selo == SEL_A) ? evNA  : evNB;
   double lb = (c.selo == SEL_A) ? evLbA : evLbB;
   if(n < 30 || lb <= BreakEven()) { c.semaforo = SEM_ESPERAR; c.motivo = MOT_EVIDENCIA; }
  }

//====================================================================
//  TEXTOS DO PAINEL
//====================================================================
string TxtSemaforo(int s)
  {
   if(s == SEM_ENTRAR) return("ENTRAR");
   if(s == SEM_EVITAR) return("EVITAR");
   return("ESPERAR");
  }
//+------------------------------------------------------------------+
string TxtSelo(int s) { return(s == SEL_A ? "A" : (s == SEL_B ? "B" : "C")); }
//+------------------------------------------------------------------+
string TxtEstrutura(int t)
  {
   switch(t)
     {
      case 1: return("Alta (HH+HL)");
      case 2: return("Baixa (LH+LL)");
      case 3: return("Compressao");
      case 4: return("Expansao");
     }
   return("Indefinida");
  }
//+------------------------------------------------------------------+
string TxtDir(int d) { return(d == 1 ? "alta" : (d == -1 ? "baixa" : "neutro")); }
//+------------------------------------------------------------------+
string TxtForca(int f) { return(f >= 3 ? "forte" : (f == 2 ? "media" : "fraca")); }
//+------------------------------------------------------------------+
string TxtMotivo(Ctx &c)
  {
   switch(c.motivo)
     {
      case MOT_SESSAO:    return("fora da sessao forte");
      case MOT_ROLLOVER:  return("janela de rollover - liquidez rala");
      case MOT_SPREAD:    return("spread acima do limite (" + IntegerToString((int)MarketInfo(Symbol(), MODE_SPREAD)) + " pts)");
      case MOT_MTF:       return("contra o TF maior " + TfNome(tfEfe));
      case MOT_SELOC:     return("selo C - qualidade baixa");
      case MOT_SEMCONF:   return("sem confluencia (" + IntegerToString(c.scoreL) + " CALL / " + IntegerToString(c.scoreS) + " PUT)");
      case MOT_PA:        return("longe da zona - espere o teste" + (c.distZonaAtr >= 0 ? " (" + DoubleToString(c.distZonaAtr, 1) + " ATR)" : ""));
      case MOT_EVIDENCIA: return("sem prova de vantagem no historico");
      case MOT_GRAU:      return("aguarde grau A/B");
      case MOT_ENTRAR:    return((c.dirDom == 1 ? "CALL selo " : "PUT selo ") + TxtSelo(c.selo)
                                 + (c.selo == SEL_A ? " - portoes fechados" : " - qualidade boa"));
     }
   return("");
  }

//====================================================================
//  GESTAO DE RISCO
//====================================================================
// Lote = (saldo x risco%) / (stop em preco x valor do ponto por lote).
// Se a corretora nao devolver tick value/size, devolve 0 e o painel
// mostra "-" em vez de inventar um numero.
//+------------------------------------------------------------------+
double LoteSugerido(double stopPreco)
  {
   if(stopPreco <= 0) return(0.0);
   double tickValue = MarketInfo(Symbol(), MODE_TICKVALUE);
   double tickSize  = MarketInfo(Symbol(), MODE_TICKSIZE);
   if(tickValue <= 0 || tickSize <= 0) return(0.0);

   double riscoDinheiro = AccountBalance() * RiscoPorTrade / 100.0;
   double valorPorPreco = tickValue / tickSize;              // $ por 1.0 de preco, por lote
   if(valorPorPreco <= 0) return(0.0);

   double lote = riscoDinheiro / (stopPreco * valorPorPreco);

   double passo = MarketInfo(Symbol(), MODE_LOTSTEP);
   double minL  = MarketInfo(Symbol(), MODE_MINLOT);
   double maxL  = MarketInfo(Symbol(), MODE_MAXLOT);
   if(passo > 0) lote = MathFloor(lote / passo) * passo;
   if(minL  > 0 && lote < minL) lote = 0.0;                  // abaixo do minimo: nao arredonda para cima
   if(maxL  > 0 && lote > maxL) lote = maxL;
   return(lote);
  }
//+------------------------------------------------------------------+
double PrecoParaPips(double preco)
  {
   double p = (Digits == 3 || Digits == 5) ? Point * 10.0 : Point;
   return(p > 0 ? preco / p : 0);
  }

//====================================================================
//  DESENHO
//====================================================================
void Desenhar(Ctx &c)
  {
   temaClaro = TemaClaro();
   double tol   = c.atr * 0.6;
   datetime tFim = Time[0] + 10 * Period() * 60;

   DesenharZonas(c, tol, tFim);
   DesenharLTs();
   DesenharFib(tFim);
   DesenharDivergencias(tol);
   if(MostrarPainel) DesenharPainel(c);
   else ApagarPainel();
  }
//+------------------------------------------------------------------+
void DesenharZonas(Ctx &c, double tol, datetime tFim)
  {
   string ns[8] = {"zRes","zRes2","zSup","zSup2","tRes","tRes2","tSup","tSup2"};
   for(int k = 0; k < 8; k++) ObjectDelete(PFX + ns[k]);
   if(!MostrarZonas) return;

   datetime tRot = Time[MathMin(Bars - 1, 12)];

   if(c.resProx > 0)
     {
      datetime ini = TopoRecT(0);
      CriarZona(PFX + "zRes", ini, c.resProx + tol, tFim, c.resProx - tol, CorBaixa(), c.forcaRes >= 3);
      CriarTexto(PFX + "tRes", tRot, c.resProx + tol, "R " + TxtForca(c.forcaRes) + " " + IntegerToString(c.forcaRes) + "x", CorBaixa());

      double r2 = SegundoTopo(c.resProx, tol);
      if(r2 > 0)
        {
         int f2 = ContaToquesTopo(r2, tol);
         CriarZona(PFX + "zRes2", ini, r2 + tol, tFim, r2 - tol, clrIndianRed, false);
         CriarTexto(PFX + "tRes2", tRot, r2 + tol, "R2 " + IntegerToString(f2) + "x", clrIndianRed);
        }
     }
   if(c.supProx > 0)
     {
      datetime ini = FundoRecT(0);
      CriarZona(PFX + "zSup", ini, c.supProx + tol, tFim, c.supProx - tol, CorAlta(), c.forcaSup >= 3);
      CriarTexto(PFX + "tSup", tRot, c.supProx - tol, "S " + TxtForca(c.forcaSup) + " " + IntegerToString(c.forcaSup) + "x", CorAlta());

      double s2 = SegundoFundo(c.supProx, tol);
      if(s2 > 0)
        {
         int g2 = ContaToquesFundo(s2, tol);
         CriarZona(PFX + "zSup2", ini, s2 + tol, tFim, s2 - tol, clrSeaGreen, false);
         CriarTexto(PFX + "tSup2", tRot, s2 - tol, "S2 " + IntegerToString(g2) + "x", clrSeaGreen);
        }
     }
  }
//+------------------------------------------------------------------+
//| LTA = fundos ascendentes ligados; LTB = topos descendentes        |
//+------------------------------------------------------------------+
void DesenharLTs()
  {
   ObjectDelete(PFX + "lta");
   ObjectDelete(PFX + "ltb");
   if(!MostrarLt) return;

   int passo = Period() * 60;

   if(cFundoN >= 2 && FundoRec(0) > FundoRec(1))
     {
      int b1 = iBarShift(NULL, 0, FundoRecT(0), false);
      int b0 = iBarShift(NULL, 0, FundoRecT(1), false);
      if(b1 >= 0 && b0 > b1)
        {
         double incl = (FundoRec(0) - FundoRec(1)) / (double)(b0 - b1);
         double proj = FundoRec(0) + incl * (b1 + 5);
         CriarLinha(PFX + "lta", FundoRecT(1), FundoRec(1), Time[0] + 5 * passo, proj, CorAlta());
        }
     }
   if(cTopoN >= 2 && TopoRec(0) < TopoRec(1))
     {
      int b1 = iBarShift(NULL, 0, TopoRecT(0), false);
      int b0 = iBarShift(NULL, 0, TopoRecT(1), false);
      if(b1 >= 0 && b0 > b1)
        {
         double incl = (TopoRec(0) - TopoRec(1)) / (double)(b0 - b1);
         double proj = TopoRec(0) + incl * (b1 + 5);
         CriarLinha(PFX + "ltb", TopoRecT(1), TopoRec(1), Time[0] + 5 * passo, proj, CorBaixa());
        }
     }
  }
//+------------------------------------------------------------------+
void DesenharFib(datetime tFim)
  {
   string ns[6] = {"f382","f500","f618","n382","n500","n618"};
   for(int k = 0; k < 6; k++) ObjectDelete(PFX + ns[k]);
   if(!MostrarFib) return;

   int look = MathMin(FibLookback, Bars - 2);
   if(look < 10) return;
   int sHi = iHighest(NULL, 0, MODE_HIGH, look, 0);
   int sLo = iLowest (NULL, 0, MODE_LOW,  look, 0);
   if(sHi < 0 || sLo < 0) return;

   double hi = High[sHi], lo = Low[sLo], amp = hi - lo;
   if(amp <= 0) return;

   bool alta = (sLo > sHi);                      // fundo antes do topo = perna de alta
   double f382 = alta ? hi - amp * 0.382 : lo + amp * 0.382;
   double f500 = alta ? hi - amp * 0.500 : lo + amp * 0.500;
   double f618 = alta ? hi - amp * 0.618 : lo + amp * 0.618;
   datetime ini = Time[MathMin(Bars - 1, MathMax(sHi, sLo))];

   CriarFib(PFX + "f382", ini, f382, tFim, clrMediumPurple);
   CriarFib(PFX + "f500", ini, f500, tFim, clrMediumPurple);
   CriarFib(PFX + "f618", ini, f618, tFim, clrMediumPurple);
   CriarTexto(PFX + "n382", Time[0], f382, "  38.2", clrMediumPurple);
   CriarTexto(PFX + "n500", Time[0], f500, "  50.0", clrMediumPurple);
   CriarTexto(PFX + "n618", Time[0], f618, "  61.8", clrMediumPurple);
  }
//+------------------------------------------------------------------+
//| Divergencia regular: topo mais alto com RSI mais fraco (e o       |
//| espelho no fundo). Marcada no pivo, ja confirmado.                |
//+------------------------------------------------------------------+
void DesenharDivergencias(double tol)
  {
   ObjectDelete(PFX + "divA");
   ObjectDelete(PFX + "divB");
   if(!MostrarDiv) return;

   if(cTopoN >= 2 && TopoRec(0) > TopoRec(1))
     {
      int b0 = iBarShift(NULL, 0, TopoRecT(0), false);
      int b1 = iBarShift(NULL, 0, TopoRecT(1), false);
      if(b0 >= 0 && b1 >= 0)
        {
         double r0 = iRSI(NULL, 0, PeriodoRsi, PRICE_CLOSE, b0);
         double r1 = iRSI(NULL, 0, PeriodoRsi, PRICE_CLOSE, b1);
         if(r0 < r1) CriarSeta(PFX + "divB", TopoRecT(0), TopoRec(0) + tol * 0.6, 242, CorBaixa());
        }
     }
   if(cFundoN >= 2 && FundoRec(0) < FundoRec(1))
     {
      int b0 = iBarShift(NULL, 0, FundoRecT(0), false);
      int b1 = iBarShift(NULL, 0, FundoRecT(1), false);
      if(b0 >= 0 && b1 >= 0)
        {
         double r0 = iRSI(NULL, 0, PeriodoRsi, PRICE_CLOSE, b0);
         double r1 = iRSI(NULL, 0, PeriodoRsi, PRICE_CLOSE, b1);
         if(r0 > r1) CriarSeta(PFX + "divA", FundoRecT(0), FundoRec(0) - tol * 0.6, 241, CorAlta());
        }
     }
  }

//====================================================================
//  PRIMITIVAS DE OBJETO
//====================================================================
void Enfeitar(string nome)
  {
   ObjectSetInteger(0, nome, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, nome, OBJPROP_SELECTED,   false);
   ObjectSetInteger(0, nome, OBJPROP_HIDDEN,     true);   // fora da lista de objetos
  }
//+------------------------------------------------------------------+
void CriarZona(string nome, datetime t1, double p1, datetime t2, double p2, color cor, bool forte)
  {
   ObjectCreate(0, nome, OBJ_RECTANGLE, 0, t1, p1, t2, p2);
   ObjectSetInteger(0, nome, OBJPROP_COLOR, cor);
   ObjectSetInteger(0, nome, OBJPROP_STYLE, forte ? STYLE_SOLID : STYLE_DOT);
   ObjectSetInteger(0, nome, OBJPROP_WIDTH, 1);
   ObjectSetInteger(0, nome, OBJPROP_BACK,  true);
   Enfeitar(nome);
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
   Enfeitar(nome);
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
   Enfeitar(nome);
  }
//+------------------------------------------------------------------+
void CriarTexto(string nome, datetime t, double p, string txt, color cor)
  {
   ObjectCreate(0, nome, OBJ_TEXT, 0, t, p);
   ObjectSetString(0, nome, OBJPROP_TEXT, txt);
   ObjectSetString(0, nome, OBJPROP_FONT, "Verdana");
   ObjectSetInteger(0, nome, OBJPROP_COLOR, cor);
   ObjectSetInteger(0, nome, OBJPROP_FONTSIZE, 7);
   Enfeitar(nome);
  }
//+------------------------------------------------------------------+
void CriarSeta(string nome, datetime t, double p, int codigo, color cor)
  {
   ObjectCreate(0, nome, OBJ_ARROW, 0, t, p);
   ObjectSetInteger(0, nome, OBJPROP_ARROWCODE, codigo);
   ObjectSetInteger(0, nome, OBJPROP_COLOR, cor);
   ObjectSetInteger(0, nome, OBJPROP_WIDTH, 1);
   Enfeitar(nome);
  }

//====================================================================
//  PAINEL
//====================================================================
int    painelLinhas = 0;
#define PNL_LARG 250

void PainelFundo(int linhas)
  {
   string n = PFX + "pnlBg";
   ObjectCreate(0, n, OBJ_RECTANGLE_LABEL, 0, 0, 0);
   ObjectSetInteger(0, n, OBJPROP_CORNER,    CORNER_RIGHT_UPPER);
   ObjectSetInteger(0, n, OBJPROP_XDISTANCE, PainelX + PNL_LARG);
   ObjectSetInteger(0, n, OBJPROP_YDISTANCE, PainelY - 8);
   ObjectSetInteger(0, n, OBJPROP_XSIZE,     PNL_LARG);
   ObjectSetInteger(0, n, OBJPROP_YSIZE,     linhas * (PainelFonte + 7) + 18);
   ObjectSetInteger(0, n, OBJPROP_BGCOLOR,   CorFundo());
   ObjectSetInteger(0, n, OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSetInteger(0, n, OBJPROP_COLOR,     temaClaro ? clrSilver : C'40,52,70');
   ObjectSetInteger(0, n, OBJPROP_BACK,      false);
   Enfeitar(n);
  }
//+------------------------------------------------------------------+
void PainelLinha(int linha, string txt, color cor, int tam)
  {
   string n = PFX + "pnl" + IntegerToString(linha);
   ObjectCreate(0, n, OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, n, OBJPROP_CORNER,    CORNER_RIGHT_UPPER);
   ObjectSetInteger(0, n, OBJPROP_ANCHOR,    ANCHOR_RIGHT_UPPER);
   ObjectSetInteger(0, n, OBJPROP_XDISTANCE, PainelX + PNL_LARG - 8);
   ObjectSetInteger(0, n, OBJPROP_YDISTANCE, PainelY + linha * (PainelFonte + 7));
   ObjectSetInteger(0, n, OBJPROP_COLOR,     cor);
   ObjectSetInteger(0, n, OBJPROP_FONTSIZE,  tam);
   ObjectSetString(0, n, OBJPROP_FONT,       "Consolas");
   ObjectSetString(0, n, OBJPROP_TEXT,       txt);
   Enfeitar(n);
   if(linha + 1 > painelLinhas) painelLinhas = linha + 1;
  }
//+------------------------------------------------------------------+
void ApagarPainel()
  {
   ObjectDelete(PFX + "pnlBg");
   for(int k = 0; k < 40; k++) ObjectDelete(PFX + "pnl" + IntegerToString(k));
   painelLinhas = 0;
  }
//+------------------------------------------------------------------+
void DesenharPainel(Ctx &c)
  {
   ApagarPainel();

   color corSem  = (c.semaforo == SEM_ENTRAR) ? CorAlta() : ((c.semaforo == SEM_EVITAR) ? CorBaixa() : clrGoldenrod);
   color corSelo = (c.selo == SEL_A) ? CorAlta() : ((c.selo == SEL_B) ? clrGoldenrod : CorBaixa());
   bool  temSinal = (c.brutoL || c.brutoS);
   string dir = temSinal ? (c.dirDom == 1 ? "  CALL" : "  PUT") : "";

   int L = 0;
   PainelLinha(L++, "QUANT OPS  " + Symbol() + " " + TfNome(Period()), CorFraca(), PainelFonte);
   PainelLinha(L++, ">> " + TxtSemaforo(c.semaforo) + " <<", corSem, PainelFonte + 4);
   PainelLinha(L++, TxtMotivo(c), corSem, PainelFonte);
   PainelLinha(L++, "Selo " + TxtSelo(c.selo) + dir, corSelo, PainelFonte + 1);
   PainelLinha(L++, "Confluencia  " + IntegerToString(c.scoreL) + " CALL / " + IntegerToString(c.scoreS)
                    + " PUT  (min " + IntegerToString(c.alvo) + "/" + IntegerToString(c.habil) + ")", CorTexto(), PainelFonte);

   string mtf = "TF " + TfNome(tfEfe) + " " + TxtDir(c.htfDir);
   if(ExigirMtfDuplo) mtf = mtf + " | " + TfNome(tf2Efe) + " " + TxtDir(c.htf2Dir);
   PainelLinha(L++, mtf, (c.htfDir == 1) ? CorAlta() : ((c.htfDir == -1) ? CorBaixa() : CorFraca()), PainelFonte);

   PainelLinha(L++, "Estrutura  " + TxtEstrutura(c.estrTipo),
               (c.estrDir == 1) ? CorAlta() : ((c.estrDir == -1) ? CorBaixa() : CorFraca()), PainelFonte);

   string zonas = "Zonas  R " + IntegerToString(c.forcaRes) + "x / S " + IntegerToString(c.forcaSup) + "x";
   if(c.distZonaAtr >= 0) zonas = zonas + "  (" + DoubleToString(c.distZonaAtr, 1) + " ATR)";
   PainelLinha(L++, zonas, CorTexto(), PainelFonte);

   string ctx = "Sessao " + (c.sess ? "forte" : "fraca");
   if(SpreadMaximo > 0) ctx = ctx + " | spread " + IntegerToString((int)MarketInfo(Symbol(), MODE_SPREAD)) + "pts";
   PainelLinha(L++, ctx, c.sess ? CorAlta() : CorBaixa(), PainelFonte);

   if(!PainelCompacto && MedirEvidencia)
     {
      PainelLinha(L++, "--- evidencia (" + IntegerToString(VelasAvaliacao) + " velas) ---", CorFraca(), PainelFonte);
      PainelLinha(L++, LinhaEvidencia("A", evNA, evWA, evLbA), CorEvidencia(evNA, evLbA), PainelFonte);
      PainelLinha(L++, LinhaEvidencia("B", evNB, evWB, evLbB), CorEvidencia(evNB, evLbB), PainelFonte);

      double lbUso = (c.selo == SEL_A) ? evLbA : evLbB;
      double expR  = ExpectativaR(lbUso);
      PainelLinha(L++, "Expectativa " + DoubleToString(expR, 2) + "R  (break-even "
                       + DoubleToString(BreakEven() * 100, 0) + "%)",
                  (expR > 0) ? CorAlta() : CorBaixa(), PainelFonte);
     }

   if(!PainelCompacto && MostrarRisco)
     {
      double stopP = c.atr * MultStopAtr;
      double alvoP = c.atr * MultAlvoAtr;
      double lote  = LoteSugerido(stopP);
      PainelLinha(L++, "--- risco ---", CorFraca(), PainelFonte);
      PainelLinha(L++, "Stop " + DoubleToString(PrecoParaPips(stopP), 1) + "p / Alvo "
                       + DoubleToString(PrecoParaPips(alvoP), 1) + "p", CorTexto(), PainelFonte);
      PainelLinha(L++, "Lote p/ " + DoubleToString(RiscoPorTrade, 1) + "%: "
                       + (lote > 0 ? DoubleToString(lote, 2) : "-"), CorTexto(), PainelFonte);
     }

   PainelLinha(L++, "ESTUDO - nao e recomendacao", clrGoldenrod, PainelFonte);
   if(!PainelCompacto) PainelLinha(L++, "evidencia bruta: sem spread/swap", CorFraca(), PainelFonte - 1);

   PainelFundo(L);
  }
//+------------------------------------------------------------------+
string LinhaEvidencia(string nivel, int n, int w, double lb)
  {
   if(n <= 0) return("Nivel " + nivel + ": sem amostra");
   double taxa = 100.0 * w / n;
   string s = "Nivel " + nivel + ": " + IntegerToString(w) + "/" + IntegerToString(n)
            + " = " + DoubleToString(taxa, 0) + "%  LB " + DoubleToString(lb * 100, 0) + "%";
   if(n < 30) s = s + " (amostra pequena)";
   return(s);
  }
//+------------------------------------------------------------------+
color CorEvidencia(int n, double lb)
  {
   if(n < 30) return(CorFraca());
   return(lb > BreakEven() ? CorAlta() : CorBaixa());
  }

//====================================================================
//  ALERTAS
//====================================================================
void Alertar()
  {
   if(Time[0] == ultimoAlerta) return;

   int b = 1;                               // ultima vela FECHADA
   if(b >= Bars) return;

   string tipo = "";
   if(BufCallA[b] != 0.0)                        tipo = "CALL NIVEL A";
   else if(BufPutA[b]  != 0.0)                   tipo = "PUT NIVEL A";
   else if(AlertarNivelB && BufCallB[b] != 0.0)  tipo = "CALL nivel B";
   else if(AlertarNivelB && BufPutB[b]  != 0.0)  tipo = "PUT nivel B";
   if(tipo == "") return;

   ultimoAlerta = Time[0];

   string msg = "QUANT OPS: " + tipo + " em " + Symbol() + " " + TfNome(Period())
              + " | " + TxtSemaforo(ctxAtual.semaforo);
   if(MedirEvidencia)
     {
      int    n  = (StringFind(tipo, "NIVEL A") >= 0) ? evNA  : evNB;
      double lb = (StringFind(tipo, "NIVEL A") >= 0) ? evLbA : evLbB;
      if(n > 0) msg = msg + " | LB " + DoubleToString(lb * 100, 0) + "% em " + IntegerToString(n) + " casos";
     }
   msg = msg + " | ESTUDO, nao e recomendacao.";

   if(AlertaPopup) Alert(msg);
   if(AlertaPush)  SendNotification(msg);
   if(AlertaSom)   PlaySound("alert.wav");
  }
//+------------------------------------------------------------------+
