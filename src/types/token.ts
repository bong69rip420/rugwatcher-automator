export interface Token {
  id?: string;
  address: string;
  name: string;
  symbol: string;
  is_active?: boolean;
  created_at?: string;
}

export interface TokenAnalysis {
  isRugPull: boolean;
  maxHolderPercentage: number;
  isSecure: boolean;
  details: string[];
  totalHolders: number;
  hasUnlimitedMint: boolean;
  hasPausableTrading: boolean;
  hasBlacklist: boolean;
  volume24h: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}
