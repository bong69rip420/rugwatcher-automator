
export interface Token {
  address: string;
  name: string;
  symbol: string;
  timestamp: number;
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
