#region Using declarations
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.ComponentModel.DataAnnotations;
using System.Linq;
using System.Windows.Media;
using System.Xml.Serialization;
using NinjaTrader.Cbi;
using NinjaTrader.Data;
using NinjaTrader.Gui;
using NinjaTrader.Gui.Chart;
using NinjaTrader.Gui.NinjaScript;
using NinjaTrader.Gui.Tools;
using NinjaTrader.NinjaScript;
using NinjaTrader.NinjaScript.DrawingTools;
using NinjaTrader.NinjaScript.Indicators;
using NinjaTrader.Core.FloatingPoint;
#endregion

namespace NinjaTrader.NinjaScript.Indicators
{
    public class RSI_Simple_Signal_v1 : Indicator
    {
        #region Private Variables
        private RSI rsi;
        private int buyCount = 0;
        private int sellCount = 0;
        #endregion

        protected override void OnStateChange()
        {
            if (State == State.SetDefaults)
            {
                Description = "Indicateur RSI simple avec fleches achat/vente aux zones extremes. Fleche verte quand RSI croise au-dessus de la zone de survente, fleche rouge quand RSI croise en-dessous de la zone de surachat.";
                Name = "RSI_Simple_Signal_v1";
                Calculate = Calculate.OnBarClose;
                IsOverlay = true;
                DisplayInDataBox = true;
                PaintPriceMarkers = false;
                BarsRequiredToPlot = 20;

                // Default parameters
                RsiPeriod = 14;
                RsiSmooth = 3;
                OversoldLevel = 30;
                OverboughtLevel = 70;
                ArrowOffset = 4;
                EnableAlerts = true;
            }
            else if (State == State.Configure)
            {
                // Single timeframe, no AddDataSeries needed
            }
            else if (State == State.DataLoaded)
            {
                rsi = RSI(Close, RsiPeriod, RsiSmooth);
            }
        }

        protected override void OnBarUpdate()
        {
            if (CurrentBar < BarsRequiredToPlot)
                return;

            // Detect RSI crossing above oversold (buy signal)
            if (CrossAbove(rsi, OversoldLevel, 1))
            {
                Draw.ArrowUp(this, "buy" + CurrentBar, true, 0,
                    Low[0] - ArrowOffset * TickSize, Brushes.Lime);
                buyCount++;

                if (EnableAlerts && State == State.Realtime)
                    Alert("buyAlert" + CurrentBar, Priority.High,
                        "ACHAT - RSI croise au-dessus de " + OversoldLevel,
                        NinjaTrader.Core.Globals.InstallDir + @"\sounds\Alert1.wav",
                        10, Brushes.DarkGreen, Brushes.White);
            }

            // Detect RSI crossing below overbought (sell signal)
            if (CrossBelow(rsi, OverboughtLevel, 1))
            {
                Draw.ArrowDown(this, "sell" + CurrentBar, true, 0,
                    High[0] + ArrowOffset * TickSize, Brushes.Red);
                sellCount++;

                if (EnableAlerts && State == State.Realtime)
                    Alert("sellAlert" + CurrentBar, Priority.High,
                        "VENTE - RSI croise en-dessous de " + OverboughtLevel,
                        NinjaTrader.Core.Globals.InstallDir + @"\sounds\Alert2.wav",
                        10, Brushes.DarkRed, Brushes.White);
            }

            // Always show info panel
            ShowInfo();
        }

        #region Helper Methods
        private void ShowInfo()
        {
            string rsiValue = CurrentBar >= RsiPeriod ? rsi[0].ToString("F1") : "---";
            string zone = "Neutre";
            if (CurrentBar >= RsiPeriod)
            {
                if (rsi[0] <= OversoldLevel) zone = "SURVENTE";
                else if (rsi[0] >= OverboughtLevel) zone = "SURACHAT";
            }

            string info = string.Format(
                "=== RSI Simple Signal ===\n" +
                "RSI({0}): {1}\n" +
                "Zone: {2}\n" +
                "Seuils: {3} / {4}\n" +
                "Signaux: {5} Achat | {6} Vente\n" +
                "Alertes: {7}",
                RsiPeriod, rsiValue, zone,
                OversoldLevel, OverboughtLevel,
                buyCount, sellCount,
                EnableAlerts ? "ON" : "OFF");

            Draw.TextFixed(this, "infoPanel", info, TextPosition.TopRight,
                Brushes.White, new SimpleFont("Consolas", 11),
                Brushes.Black, Brushes.Black, 80);
        }
        #endregion

        #region Properties

        [NinjaScriptProperty]
        [Range(2, 100)]
        [Display(Name = "RSI Period", Order = 1, GroupName = "1. RSI")]
        public int RsiPeriod { get; set; }

        [NinjaScriptProperty]
        [Range(1, 10)]
        [Display(Name = "RSI Smooth", Order = 2, GroupName = "1. RSI")]
        public int RsiSmooth { get; set; }

        [NinjaScriptProperty]
        [Range(5, 45)]
        [Display(Name = "Oversold Level", Order = 3, GroupName = "2. Zones")]
        public int OversoldLevel { get; set; }

        [NinjaScriptProperty]
        [Range(55, 95)]
        [Display(Name = "Overbought Level", Order = 4, GroupName = "2. Zones")]
        public int OverboughtLevel { get; set; }

        [NinjaScriptProperty]
        [Range(1, 20)]
        [Display(Name = "Arrow Offset (ticks)", Order = 5, GroupName = "3. Display")]
        public int ArrowOffset { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Enable Alerts", Order = 6, GroupName = "3. Display")]
        public bool EnableAlerts { get; set; }

        #endregion
    }
}
