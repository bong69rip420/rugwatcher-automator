
import { supabase } from '@/integrations/supabase/client';

interface TradeConfig {
  id: string;
  max_trade_amount: number;
  min_liquidity: number;
  is_active: boolean;
  wallet_private_key?: string;
  created_at: string;
  updated_at: string;
}

export class ConfigurationService {
  private static instance: ConfigurationService;

  private constructor() {}

  static getInstance(): ConfigurationService {
    if (!ConfigurationService.instance) {
      ConfigurationService.instance = new ConfigurationService();
    }
    return ConfigurationService.instance;
  }

  async getTradeConfig(): Promise<TradeConfig | null> {
    const { data, error } = await supabase
      .from('trading_config')
      .select('*')
      .eq('is_active', true)
      .single();

    if (error) throw error;
    return data;
  }
}

export const configurationService = ConfigurationService.getInstance();
