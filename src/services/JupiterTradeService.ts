import { Connection, PublicKey, Keypair, VersionedTransaction } from '@solana/web3.js';
import JSBI from 'jsbi';
import { configurationService } from './ConfigurationService';
import bs58 from 'bs58';

// Jupiter types
type QuoteResponse = {
  inAmount: string;
  outAmount: string;
  outAmountWithSlippage: string;
  priceImpactPct: number;
  marketInfos: any[];
  swapTransaction: string;
};

export class JupiterTradeService {
  private static instance: JupiterTradeService;
  private connection: Connection | null = null;
  private tradingWallet: Keypair | null = null;
  private isInitializing = false;
  private initPromise: Promise<void> | null = null;
  private lastRequestTime = 0;
  private readonly MIN_REQUEST_INTERVAL = 1000; // 1 second between requests
  private readonly JUPITER_API_URL = 'https://quote-api.jup.ag/v6';

  private constructor() {}

  static getInstance(): JupiterTradeService {
    if (!JupiterTradeService.instance) {
      JupiterTradeService.instance = new JupiterTradeService();
    }
    return JupiterTradeService.instance;
  }

  private async waitForRequestWindow() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.MIN_REQUEST_INTERVAL) {
      await new Promise(resolve => setTimeout(resolve, this.MIN_REQUEST_INTERVAL - timeSinceLastRequest));
    }
    this.lastRequestTime = Date.now();
  }

  async initialize(connection: Connection) {
    if (this.initPromise) {
      console.log('Waiting for existing initialization to complete');
      await this.initPromise;
      return;
    }

    if (this.connection === connection) {
      console.log('Already initialized with the same connection');
      return;
    }

    this.initPromise = this._initialize(connection);
    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  private async _initialize(connection: Connection) {
    try {
      this.isInitializing = true;
      console.log('Starting initialization');
      this.connection = connection;
      console.log('Initialized successfully');
    } catch (error) {
      console.error('Error initializing:', error);
      this.connection = null;
      throw error;
    } finally {
      this.isInitializing = false;
    }
  }

  async getWalletBalance(): Promise<number> {
    if (!this.connection || !this.tradingWallet) {
      throw new Error('Connection or wallet not initialized');
    }

    try {
      await this.waitForRequestWindow();
      const balance = await this.connection.getBalance(this.tradingWallet.publicKey);
      return balance / 1e9; // Convert lamports to SOL
    } catch (error) {
      console.error('Error fetching wallet balance:', error);
      throw error;
    }
  }

  static generateTestKeypair(): { publicKey: string, privateKey: string } {
    try {
      const keypair = Keypair.generate();
      const publicKey = keypair.publicKey.toString();
      const privateKey = bs58.encode(keypair.secretKey);
      console.log('Generated test keypair:');
      console.log('Public key:', publicKey);
      console.log('Private key:', privateKey);

      // Verify the generated keypair can be decoded back
      const decoded = bs58.decode(privateKey);
      console.log('Test key validation - decoded length:', decoded.length);
      const verifyKeypair = Keypair.fromSecretKey(decoded);
      console.log('Test key validation - successfully created verification keypair');

      return { publicKey, privateKey };
    } catch (error) {
      console.error('Error generating test keypair:', error);
      throw error;
    }
  }

  setTradingWallet(privateKey: string) {
    try {
      if (!privateKey || typeof privateKey !== 'string') {
        throw new Error('Private key must be a non-empty string');
      }

      console.log('Starting wallet setup with raw key hash:', privateKey.slice(0, 4) + '...' + privateKey.slice(-4));
      console.log('Key length:', privateKey.length);

      // Decode private key with detailed logging
      console.log('Decoding Base58 key...');
      const secretKey = bs58.decode(privateKey);
      console.log('Decoded key length:', secretKey.length, 'bytes');
      console.log('First 4 bytes:', Array.from(secretKey.slice(0, 4)));

      if (secretKey.length !== 64) {
        throw new Error(`Invalid decoded key length: ${secretKey.length}. Expected 64 bytes.`);
      }

      // Try creating the keypair
      try {
        const newKeypair = Keypair.fromSecretKey(secretKey);
        console.log('Successfully created Solana keypair!');
        const publicKey = newKeypair.publicKey.toString();
        console.log('Public key:', publicKey);
        
        this.tradingWallet = newKeypair;
        return publicKey;
      } catch (error) {
        console.error('Error creating keypair:', error);
        
        // Generate a test keypair to show a working example
        console.log('Generating a test keypair for reference...');
        const testKeypair = JupiterTradeService.generateTestKeypair();
        
        throw new Error(
          'Failed to create Solana keypair. For testing, you can use this valid private key: ' + 
          testKeypair.privateKey
        );
      }
    } catch (error) {
      console.error('Error in setTradingWallet:', error);
      throw error;
    }
  }

  private async fetchQuote(inputMint: string, outputMint: string, amount: number): Promise<QuoteResponse> {
    const params = new URLSearchParams({
      inputMint,
      outputMint,
      amount: (amount * 1_000_000).toString(),
      slippageBps: '100',
    });

    const response = await fetch(`${this.JUPITER_API_URL}/quote?${params}`);
    if (!response.ok) {
      throw new Error('Failed to fetch quote from Jupiter');
    }
    return response.json();
  }

  async executePurchase(tokenAddress: string, amount: number): Promise<string> {
    if (!this.connection || !this.tradingWallet) {
      throw new Error('Trade service not initialized or wallet not set');
    }

    try {
      const retryCount = 3;
      let lastError: Error | null = null;

      for (let i = 0; i < retryCount; i++) {
        try {
          await this.waitForRequestWindow();
          
          const config = await configurationService.getTradeConfig();
          console.log('Using trade config:', config);

          const inputMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // USDC mint
          const outputMint = tokenAddress;

          const quote = await this.fetchQuote(inputMint, outputMint, amount);
          console.log('Received quote:', quote);

          await this.waitForRequestWindow();
          const response = await fetch(`${this.JUPITER_API_URL}/swap`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              quoteResponse: quote,
              userPublicKey: this.tradingWallet.publicKey.toString(),
              wrapUnwrapSOL: true,
            }),
          });

          if (!response.ok) {
            throw new Error('Failed to create swap transaction');
          }

          const { swapTransaction } = await response.json();
          const transaction = VersionedTransaction.deserialize(
            Buffer.from(swapTransaction, 'base64')
          );

          transaction.sign([this.tradingWallet]);
          
          await this.waitForRequestWindow();
          const signature = await this.connection.sendRawTransaction(
            transaction.serialize(),
            {
              skipPreflight: false,
              preflightCommitment: 'confirmed',
              maxRetries: 3,
            }
          );
          
          console.log('Trade executed successfully:', signature);
          return signature;
        } catch (error) {
          console.error(`Attempt ${i + 1} failed:`, error);
          lastError = error;
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }
      }

      if (lastError) {
        throw lastError;
      }

      throw new Error('Failed to execute trade after retries');
    } catch (error) {
      console.error('Error executing trade:', error);
      throw error;
    }
  }
}

export const jupiterTradeService = JupiterTradeService.getInstance();
