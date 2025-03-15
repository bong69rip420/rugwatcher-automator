
import { supabase } from "@/integrations/supabase/client";

export interface Token {
  id: string;
  address: string;
  name: string;
  symbol: string;
  is_active: boolean;
  created_at: string;
}

export interface Trade {
  id: string;
  token_address: string;
  amount: number;
  price: number | null;
  status: 'pending' | 'completed' | 'failed';
  transaction_hash: string | null;
  created_at: string;
}

export class SupabaseService {
  async getMonitoredTokens(): Promise<Token[]> {
    try {
      const { data, error } = await supabase
        .from('monitored_tokens')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching tokens:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error in getMonitoredTokens:', error);
      return [];
    }
  }

  async getTrades(): Promise<Trade[]> {
    try {
      const { data, error } = await supabase
        .from('trades')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching trades:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error in getTrades:', error);
      return [];
    }
  }

  async addToken(token: Omit<Token, 'id' | 'created_at' | 'is_active'>): Promise<Token | null> {
    try {
      console.log('Adding token to database:', token);
      const { data, error } = await supabase
        .from('monitored_tokens')
        .insert([token])
        .select()
        .single();

      if (error) {
        console.error('Error adding token:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error in addToken:', error);
      return null;
    }
  }

  async addTrade(trade: Omit<Trade, 'id' | 'created_at'>): Promise<Trade | null> {
    try {
      const { data, error } = await supabase
        .from('trades')
        .insert([trade])
        .select()
        .single();

      if (error) {
        console.error('Error adding trade:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error in addTrade:', error);
      return null;
    }
  }
}

export const supabaseService = new SupabaseService();
