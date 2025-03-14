import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { TokenMonitor } from "@/services/TokenMonitor";
import { TradingService } from "@/services/TradingService";
import { AlertCircle, CheckCircle, RefreshCw, Wallet } from "lucide-react";
import { supabaseService, type Token, type Trade } from "@/services/SupabaseService";
import { useQuery } from "@tanstack/react-query";
import { solanaTradeExecutor } from "@/services/SolanaTradeExecutor";

export const Dashboard = () => {
  const { toast } = useToast();
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    const fetchBalance = async () => {
      try {
        setLoading(true);
        await solanaTradeExecutor.initialize();
        const balance = await solanaTradeExecutor.getWalletBalance();
        setBalance(balance);
      } catch (error) {
        console.error('Error fetching wallet balance:', error);
        toast({
          variant: "destructive",
          title: "Error fetching wallet balance",
          description: error instanceof Error ? error.message : "Please check your wallet configuration"
        });
      } finally {
        setLoading(false);
      }
    };

    fetchBalance();
    const interval = setInterval(fetchBalance, 30000);
    return () => clearInterval(interval);
  }, [toast]);

  const { data: tokens = [], refetch: refetchTokens } = useQuery({
    queryKey: ['tokens'],
    queryFn: () => supabaseService.getMonitoredTokens(),
  });

  const { data: trades = [], refetch: refetchTrades } = useQuery({
    queryKey: ['trades'],
    queryFn: () => supabaseService.getTrades(),
  });

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
          <div className="flex items-center gap-4">
            <Card className="bg-gray-800/50 p-4 flex items-center gap-2">
              <Wallet className="w-5 h-5 text-green-400" />
              <div>
                <p className="text-sm text-gray-400">Wallet Balance</p>
                <p className="font-medium">
                  {loading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : balance !== null ? (
                    `${balance.toFixed(4)} SOL`
                  ) : (
                    'Wallet not configured'
                  )}
                </p>
              </div>
            </Card>
            <Button
              onClick={handleToggleMonitoring}
              variant={isMonitoring ? "destructive" : "default"}
              className="flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${isMonitoring ? "animate-spin" : ""}`} />
              {isMonitoring ? "Stop Monitoring" : "Start Monitoring"}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <Card className="p-6 backdrop-blur-lg bg-card">
            <h2 className="text-2xl font-semibold mb-4">Recent Tokens</h2>
            <div className="space-y-4">
              {tokens.map((token) => (
                <div
                  key={token.id}
                  className="flex items-center justify-between p-4 rounded-lg bg-gray-800/50 animate-fade-up"
                >
                  <div>
                    <p className="font-medium">{token.name}</p>
                    <p className="text-sm text-gray-400">{token.symbol}</p>
                  </div>
                  <p className="text-sm text-gray-400">
                    {new Date(token.created_at).toLocaleTimeString()}
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
                  key={trade.id}
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
                        {trade.token_address.slice(0, 6)}...{trade.token_address.slice(-4)}
                      </p>
                      <p className="text-sm text-gray-400">${trade.amount}</p>
                    </div>
                  </div>
                  <p className="text-sm text-gray-400">
                    {new Date(trade.created_at).toLocaleTimeString()}
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
