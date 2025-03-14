
interface Token {
  address: string;
  name: string;
  symbol: string;
  timestamp: number;
}

interface TokenAnalysis {
  isRugPull: boolean;
  maxHolderPercentage: number;
  isSecure: boolean;
  details: string[];
}

export class TokenMonitor {
  private static instance: TokenMonitor;
  private intervalId: NodeJS.Timeout | null = null;
  private tokens: Token[] = [];
  private onNewToken: ((token: Token) => void) | null = null;

  private constructor() {}

  static getInstance(): TokenMonitor {
    if (!TokenMonitor.instance) {
      TokenMonitor.instance = new TokenMonitor();
    }
    return TokenMonitor.instance;
  }

  setOnNewToken(callback: (token: Token) => void) {
    this.onNewToken = callback;
  }

  start() {
    if (this.intervalId) return;

    this.intervalId = setInterval(() => {
      this.checkNewTokens();
    }, 3 * 60 * 1000); // 3 minutes

    // Initial check
    this.checkNewTokens();
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async checkNewTokens() {
    try {
      // Mock implementation - replace with actual API call
      const mockNewToken: Token = {
        address: "0x" + Math.random().toString(16).slice(2, 42),
        name: "New Token " + Date.now(),
        symbol: "NT" + Math.floor(Math.random() * 1000),
        timestamp: Date.now(),
      };

      this.tokens.push(mockNewToken);
      if (this.onNewToken) {
        this.onNewToken(mockNewToken);
      }
    } catch (error) {
      console.error("Error checking new tokens:", error);
    }
  }

  async analyzeToken(token: Token): Promise<TokenAnalysis> {
    // Mock implementation - replace with actual analysis
    return {
      isRugPull: false,
      maxHolderPercentage: Math.random() * 15,
      isSecure: true,
      details: ["Contract verified", "No mint function", "Ownership renounced"],
    };
  }

  getTokens(): Token[] {
    return this.tokens;
  }
}
