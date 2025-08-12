import { createClient, TESTNET_RELAY_API } from '@reservoir0x/relay-sdk';
import { createWalletClient, http, parseEther } from 'viem';
import { baseSepolia, sepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { QuoteResponse } from '@/app/utils/interfaces';
// import dotenv from "dotenv";
// dotenv.config();

const privateKey = process.env.PRIVATE_KEY as `0x${string}`;
if (!privateKey) throw new Error ("Private key not found");

// Initialize Relay client with proper chain format
createClient({
  baseApiUrl: TESTNET_RELAY_API,
  source: "your-app-name",
  chains: [
    { 
      id: 84532, 
      name: 'Base Sepolia',
      displayName: 'Base Sepolia'
    },
    { 
      id: 11155111, 
      name: 'Sepolia',
      displayName: 'Sepolia'
    }
  ]
});


async function checkQuote() {
  try {
    const account = privateKeyToAccount(privateKey);
    
    // Get quote for bridging from Base Sepolia ETH to Sepolia ETH
    const quote = await fetch('https://api.testnets.relay.link/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user: account.address,
        originChainId: 84532, // Base Sepolia
        destinationChainId: 11155111, // Sepolia
        originCurrency: '0x0000000000000000000000000000000000000000', // ETH
        destinationCurrency: '0x0000000000000000000000000000000000000000', // ETH
        amount: parseEther('0.01').toString(), // 0.01 ETH
        tradeType: 'EXACT_INPUT'
      })
    });

    if (!quote.ok) {
      const errorText = await quote.text();
      throw new Error(`Quote failed: ${quote.statusText} - ${errorText}`);
    }

    const quoteData = await quote.json() as QuoteResponse;
    
    console.log('=== BRIDGE QUOTE DETAILS ===');
    console.log(`From: ${quoteData.details.currencyIn.amountFormatted} ETH on Base Sepolia`);
    console.log(`To: ${quoteData.details.currencyOut.amountFormatted} ETH on Sepolia`);
    console.log(`Time Estimate: ${quoteData.details.timeEstimate} seconds`);
    
    // Fee breakdown
    console.log('\n=== FEES ===');
    console.log(`Gas Fee: ${quoteData.fees.gas.amountFormatted} ETH ($${quoteData.fees.gas.amountUsd})`);
    console.log(`Relayer Fee: ${quoteData.fees.relayer.amountFormatted} ${quoteData.fees.relayer.currency.symbol} ($${quoteData.fees.relayer.amountUsd})`);
    
    // Total impact
    console.log('\n=== IMPACT ===');
    console.log(`Total Impact: $${quoteData.details.totalImpact.usd} (${quoteData.details.totalImpact.percent}%)`);
    console.log("Full QUOTE data", quoteData)
    return quoteData;
    
  } catch (error) {
    console.error('Quote Error:', error);
  }
}

checkQuote();