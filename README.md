# Titan-Sniper-Bot

old sniper bot i used to use
for uni v2
contract is verified in bscscan.
most likely will not work
![Titan Interface](https://github.com/NeoMitashi/Titan-Sniper-Bot/blob/main/image.png)



## Smart Contract 
The bot uses a smart contract to buy and sell tokens. This can be used to add additional features to the bot. The bot also has a script to deploy the smart contract (source code of the smart contract is verified on block chain explorer). 
* It gives you the ability to make multi wallet buys within the same transaction.
* Can be used to implement fail-safe which will revert the transaction (eg: if tax is above the maximum threshold, if you get blackListed, etc.).
* It can do multiple internal contract calls within the same transaction.
* And can work as a honeyhot checker contract aswell.

### Sniper
* Blind Mode => Buy any token on launch with custom gasPrice, gasLimit and the maximum tax tolerance. The transaction will revert if the token has higher tax than the limit thus refunding the remaining gas. 
* Liquidity Back Runner Mode => Backruns "add Liquidity" transaction on any token which will make your transaction in the same block with the closest block position as the target transaction. How close you are to the target depends on your node latency. The bot will make your transaction gasPrice the same as the target so that it won't frunt run the target. 
* Normal Mode => The bot buys the specified token when the taxes are below the maximum threshold, trading is enabled and when it is sure that the transaction will succeed. 
* On Smart Contract Call => The bot buys the target token when the bot sees a specified smart contract call on the mempool. This makes your buy in the same block as "trading enabling" transaction. It can be used in any scenario such as finalizing a presale or a specific function call on the token contract.
   
### Auto Seller
* Auto Sell => Sells a percent of your token balance when trading is enabled and taxes are below specified threshold.

### Tracker Mode
* This mode lets you copy all the trades of as many wallet as you want.
* FrontRun or BackRun the buys and sells before a whale is about to buy or dump
.* The bot will copy both buys and sells from the specified exchange.
* Can set a maximum buy amount and if exceeds it will not trigger the transaciton.

### Buy On Presale
* Missing out public presale because it fills up before your transaction? This mode lets you buy in any public or white listed (if you are white listed) presale before it fills up

### Node Tests
* Test your wss or http node 
* Shows you the nodes latency in detail

