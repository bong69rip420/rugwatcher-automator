
import { supabase } from '@/integrations/supabase/client';

export class ConfigurationService {
  private static instance: ConfigurationService;

  private constructor() {}

  static getInstance(): ConfigurationService {
    if (!ConfigurationService.instance) {
      ConfigurationService.instance = new ConfigurationService();
    }
    return ConfigurationService.instance;
  }

  async getTradeConfig() {
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
