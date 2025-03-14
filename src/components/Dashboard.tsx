
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { TokenMonitor } from "@/services/TokenMonitor";
import { TradingService } from "@/services/TradingService";
import { AlertCircle, CheckCircle, RefreshCw } from "lucide-react";

interface Token {
  address: string;
  name: string;
  symbol: string;
  timestamp: number;
}

interface Trade {
  tokenAddress: string;
  amount: number;
  timestamp: number;
  status: "pending" | "completed" | "failed";
}

export const Dashboard = () => {
  const { toast } = useToast();
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const tokenMonitor = TokenMonitor.getInstance();
    const tradingService = TradingService.getInstance();

    tokenMonitor.setOnNewToken(async (token) => {
      setTokens((prev) => [...prev, token]);
      toast({
        title: "New Token Detected",
        description: `${token.name} (${token.symbol}) has been listed`,
      });

      const analysis = await tokenMonitor.analyzeToken(token);
      if (analysis.isSecure) {
        setLoading(true);
        const trade = await tradingService.executeTrade(token.address, 0.1);
        setTrades((prev) => [...prev, trade]);
        setLoading(false);

        toast({
          title: trade.status === "completed" ? "Trade Executed" : "Trade Failed",
          description: `${token.symbol}: ${trade.status}`,
          variant: trade.status === "completed" ? "default" : "destructive",
        });
      }
    });

    return () => {
      tokenMonitor.stop();
    };
  }, []);

  const handleToggleMonitoring = () => {
    const tokenMonitor = TokenMonitor.getInstance();
    if (isMonitoring) {
      tokenMonitor.stop();
    } else {
      tokenMonitor.start();
    }
    setIsMonitoring(!isMonitoring);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 text-white p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex justify-between items-center">
          <h1 className="text-4xl font-bold">Crypto Trading Bot</h1>
          <Button
            onClick={handleToggleMonitoring}
            variant={isMonitoring ? "destructive" : "default"}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isMonitoring ? "animate-spin" : ""}`} />
            {isMonitoring ? "Stop Monitoring" : "Start Monitoring"}
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <Card className="p-6 backdrop-blur-lg bg-card">
            <h2 className="text-2xl font-semibold mb-4">Recent Tokens</h2>
            <div className="space-y-4">
              {tokens.map((token) => (
                <div
                  key={token.address}
                  className="flex items-center justify-between p-4 rounded-lg bg-gray-800/50 animate-fade-up"
                >
                  <div>
                    <p className="font-medium">{token.name}</p>
                    <p className="text-sm text-gray-400">{token.symbol}</p>
                  </div>
                  <p className="text-sm text-gray-400">
                    {new Date(token.timestamp).toLocaleTimeString()}
                  </p>
                </div>
              ))}
              {tokens.length === 0 && (
                <p className="text-gray-400 text-center py-4">No tokens detected yet</p>
              )}
            </div>
          </Card>

          <Card className="p-6 backdrop-blur-lg bg-card">
            <h2 className="text-2xl font-semibold mb-4">Recent Trades</h2>
            <div className="space-y-4">
              {trades.map((trade) => (
                <div
                  key={`${trade.tokenAddress}-${trade.timestamp}`}
                  className="flex items-center justify-between p-4 rounded-lg bg-gray-800/50 animate-fade-up"
                >
                  <div className="flex items-center gap-2">
                    {trade.status === "completed" ? (
                      <CheckCircle className="w-5 h-5 text-secondary" />
                    ) : trade.status === "failed" ? (
                      <AlertCircle className="w-5 h-5 text-error" />
                    ) : (
                      <RefreshCw className="w-5 h-5 animate-spin" />
                    )}
                    <div>
                      <p className="font-medium">
                        {trade.tokenAddress.slice(0, 6)}...{trade.tokenAddress.slice(-4)}
                      </p>
                      <p className="text-sm text-gray-400">${trade.amount}</p>
                    </div>
                  </div>
                  <p className="text-sm text-gray-400">
                    {new Date(trade.timestamp).toLocaleTimeString()}
                  </p>
                </div>
              ))}
              {trades.length === 0 && (
                <p className="text-gray-400 text-center py-4">No trades executed yet</p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
