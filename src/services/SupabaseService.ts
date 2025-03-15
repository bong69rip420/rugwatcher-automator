
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
      console.log('Fetching monitored tokens from Supabase...');
      const { data, error } = await supabase
        .from('monitored_tokens')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching tokens:', error.message, error.details);
        return [];
      }

      console.log('Successfully fetched tokens:', data?.length || 0, 'tokens');
      return data || [];
    } catch (error) {
      console.error('Unexpected error in getMonitoredTokens:', error);
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
      
      const tokenData = {
        address: token.address,
        name: token.name,
        symbol: token.symbol,
        is_active: true
      };

      const { data, error } = await supabase
        .from('monitored_tokens')
        .insert([tokenData])
        .select()
        .single();

      if (error) {
        console.error('Error adding token:', error.message, error.details);
        return null;
      }

      console.log('Successfully added token:', data);
      return data;
    } catch (error) {
      console.error('Unexpected error in addToken:', error);
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
