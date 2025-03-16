
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
    try {
      // Always return testnet configuration
      return {
        rpcUrl: 'https://api.testnet.solana.com',
        network: 'testnet',
        clusterApiUrl: 'https://api.testnet.solana.com',
      };
    } catch (error) {
      console.error('Error getting blockchain provider:', error);
      throw error;
    }
  }
}

export const blockchainService = BlockchainService.getInstance();
