
import { supabase } from "@/integrations/supabase/client";

export class BlockchainService {
  private static instance: BlockchainService;
  
  // Make constructor protected instead of private for singleton pattern
  protected constructor() {}

  static getInstance(): BlockchainService {
    if (!BlockchainService.instance) {
      BlockchainService.instance = new BlockchainService();
    }
    return BlockchainService.instance;
  }

  async getProvider() {
    // Get provider configuration from edge function directly
    // Removing the blockchain_config query that caused type errors
    const { data } = await supabase.functions.invoke('get-blockchain-provider');
    return data;
  }
}

// Export a singleton instance
export const blockchainService = BlockchainService.getInstance();
