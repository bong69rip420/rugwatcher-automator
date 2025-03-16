
import { supabase } from "@/integrations/supabase/client";

export class BlockchainService {
  private static instance: BlockchainService;
  
  protected constructor() {}

  static getInstance(): BlockchainService {
    if (!BlockchainService.instance) {
      BlockchainService.instance = new BlockchainService();
    }
    return BlockchainService.instance;
  }

  async getProvider() {
    const { data } = await supabase.functions.invoke('get-blockchain-provider');
    return {
      ...data,
      rpcUrl: 'https://api.testnet.solana.com',
      network: 'testnet'
    };
  }
}

export const blockchainService = BlockchainService.getInstance();
