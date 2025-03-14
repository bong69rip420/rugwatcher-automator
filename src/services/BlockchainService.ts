
import { supabase } from "@/integrations/supabase/client";

export class BlockchainService {
  private static instance: BlockchainService;
  private constructor() {}

  static getInstance(): BlockchainService {
    if (!BlockchainService.instance) {
      BlockchainService.instance = new BlockchainService();
    }
    return BlockchainService.instance;
  }

  async getProvider() {
    const { data: config } = await supabase
      .from('blockchain_config')
      .select('*')
      .single();

    // Call the edge function to get configured provider
    const { data } = await supabase.functions.invoke('get-blockchain-provider');
    return data;
  }
}

export const blockchainService = new BlockchainService();
