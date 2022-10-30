const Web3 = require('web3');
const abiDecoder = require('abi-decoder');
const fs = require('fs');
let term = require( 'terminal-kit' ).terminal ;
var figlet = require('figlet');
let BigNumber = require('bignumber.js');
const { RouterAbi, FactoryAbi, SaleAbi, ICCoreAbi, tokenAbi } = require('./Abi');
const asciichart = require ('asciichart');
const axios = require('axios');
const { AsyncLocalStorage } = require('async_hooks');
let chart = []


let mainAddr = "you addr";

let rawData;

// env data
let privateKey;
let BscScanApiKey;
let httpProviderUrl;
let wssProviderUrl;

let routerAddress;
let factoryAddress;
let ICContractAddress;

let baseTokens = {}
let WBNBAddress;
let WBNBContract;

// memory data
let wallet;

let mainGasPrice = '2000000';

let web3;
let web3Wss;

let Router;
let Factory;
let icMain;

let normalGas;

const options = {
    style: term.white.inverse,
    selectedStyle: term.white,
    leftPadding: ' ',
    selectedLeftPadding: '❯',
    rightPadding: ' ',
    selectedRightPadding: ' ',
    itemMaxWidth: term.width * 20,
} ;

async function transferJsonDataToMemory(){
    await fs.readFile('./userData.json' , (err, data) => {
        if(err){
            console.log(err);
        } else {
            rawData = JSON.parse(data);
            privateKey = rawData.PrivateKey;
            httpProviderUrl = rawData.httpProviderUrl;
            wssProviderUrl = rawData.wssProviderUrl;
            routerAddress = rawData.RouterAddress;
            factoryAddress = rawData.FactoryAddress;
            ICContractAddress = rawData.TitanSmartContract;
            baseTokens = rawData.baseTokens;
            WBNBAddress = rawData.WBNBAddress;
            BscScanApiKey = rawData.BscScanApiKey;
        }
    });
    return new Promise(resolve=>{
        setTimeout(resolve,1000)
    })
}


class Time {
    start(){
        this.startTime = new Date().getTime();
    }
    end(){
        this.endTime = new Date().getTime();
    }
    getTime(){
        return this.endTime - this.startTime;
    }

}



function initWeb3() {
    web3 = new Web3(new Web3.providers.HttpProvider(httpProviderUrl));
    web3Wss = new Web3(new Web3.providers.WebsocketProvider(wssProviderUrl));
    normalGas = web3.utils.toWei('5', 'gwei');
}

function initContract() {
    Router = new web3.eth.Contract(RouterAbi, routerAddress);
    Factory = new web3.eth.Contract(FactoryAbi, factoryAddress);
    icMain = new web3.eth.Contract(ICCoreAbi, ICContractAddress);
    abiDecoder.addABI(RouterAbi);
    abiDecoder.addABI(FactoryAbi);
}

function initWallet() {
    wallet = web3.eth.accounts.privateKeyToAccount(privateKey);
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


async function init() {
    
    console.clear();
    await transferJsonDataToMemory();
    initWeb3();
    initContract();
    initWallet();

}

function getContractAbi(address) {
    return new Promise(resolve => {
        axios.get(`https://api.bscscan.com/api?module=contract&action=getabi&address=${address}&apikey=${BscScanApiKey}`)
            .then(res => {
                resolve(res.data.result);
            })
            .catch(err => {
                console.log(err);
            })
    })
}

function getContractMethods(abi){
    let methods = [];
    //remove stateMutability pure or view from methods
    // return with internal 
    for(let i = 0; i < abi.length; i++){
        if(abi[i].type === 'function'){
            if(abi[i].stateMutability === 'view' || abi[i].stateMutability === 'pure'){
                continue;
            }
            let inputString;
            if(abi[i].inputs.length > 0){
                for(let j = 0; j < abi[i].inputs.length; j++){
                    // exclude undefined
                    if(abi[i].inputs[j].type === 'undefined'){
                        continue;
                    }
                    if(j === 0){
                        inputString = abi[i].inputs[j].type;
                    } else {
                        inputString = inputString + "," + abi[i].inputs[j].type;
                    }
                }
                methods.push(abi[i].name + "(" + inputString + ")");
            } else {
                methods.push(abi[i].name + "()");
            }


        }
    }



    return methods;
}

async function BlindModeInternal(toBuy,amount,buyWith,gasPriced,slippage,delay) {
    amount = web3.utils.toWei(amount, 'ether');
    gasPriced = web3.utils.toWei(gasPriced.toString(), 'gwei');
    let SM = new web3.eth.Contract(tokenAbi, toBuy);
    slippage = slippage.toString();
    let balanceBefore;

   
    let swapRaw = icMain.methods.BUY(toBuy,buyWith,amount,slippage,routerAddress);
    let tx = {
        from: wallet.address,
        to: ICContractAddress,
        gasPrice: gasPriced,
        data: swapRaw.encodeABI(),
        gas: mainGasPrice,
        nonce: await web3.eth.getTransactionCount(wallet.address)
    }





    let signedTx = await wallet.signTransaction(tx);

    if(delay != false){
        term.yellow('\nDelaying for ' + delay + ' Milliseconds\n\n');
        await sleep(delay);
        term.green('\nDelay over\n\n');
    }

        await web3.eth.sendSignedTransaction(signedTx.rawTransaction)
        .on('transactionHash', async (hash) => {
            term.green('TxHash: ' + hash);
            term.cyan("\n\nWaiting for confirmation...");
            balanceBefore = await SM.methods.balanceOf(ICContractAddress).call();
        })
        .on('receipt', (receipt) => {

            term.green("\n\nTx confirmed");
            return true;
        }).on('error' , () => {return});
    return balanceBefore
}

async function BlindMode() {

    console.clear();
    await blindModeDataCollector();


}

async function blindModeDataCollector(){
    // reurns all answers of the blind mode questions in an object

    console.log('\n')



    let data = {
        amountToUse: 0,
        buyWith: '0x0000000000000000000000000000000000000000',  
        gasPrice: 5,
        slippage: 1,
        openSellMenu: false,
    }

    term.cyan('input the token you want to use to buy (eg: bnb)\n');



    let input = await term.singleColumnMenu(Object.keys(baseTokens), options).promise;
    input = input.selectedText
    data.buyWith = baseTokens[input];



    data.amountToUse = await getInput(`\nInput the amount of ${input} you want to use: `);

    term.cyan('\n\ninput gas price (normal = 5)\n');
    await term.singleColumnMenu(['5', '10', '20', 'custom'], options).promise.then(async (answer) => {
        if(answer.selectedText === '5'){
            data.gasPrice = 5;
        }
        if(answer.selectedText === '10'){
            data.gasPrice = 10;
        }
        if(answer.selectedText === '20'){
            data.gasPrice = 20;
        }
        if(answer.selectedText === 'custom'){   
            let customGasPrice = await getInput('\ninput gas price (normal = 5): ');
            data.gasPrice = customGasPrice;
        }
    });



    term.cyan('\ninput slippage (normal = 5) \n');
    await term.singleColumnMenu(['1', '10', '20', 'custom'], options).promise.then(async (answer) => {
        if(answer.selectedText === '1'){
            data.slippage = 1;
        }
        if(answer.selectedText === '10'){
            data.slippage = 10;
        }
        if(answer.selectedText === '20'){
            data.slippage = 20;
        }
        if(answer.selectedText === 'custom'){   
            let customSlippage = await getInput('\ninput slippage: ');
            data.slippage = customSlippage;
        }
    });

    let delay;

    term.cyan('\nAnti Bot Delay? (true or false)\n');
    await term.singleColumnMenu(['false', 'true'], options).promise.then(async (answer) => {
        if(answer.selectedText === 'true'){
            delay = await getInput('\ninput delay (in MilliSeconds): ');
        }
        if(answer.selectedText === 'false'){
            delay = false;
        }
    });





    // open sell menu?
    term.cyan('\n\nopen sell menu? (true or false)\n');
    await term.singleColumnMenu(['true', 'false'], options).promise.then(async (answer) => {
        if(answer.selectedText === 'true'){
            data.openSellMenu = true;
        }
        if(answer.selectedText === 'false'){
            data.openSellMenu = false;
        }
    });


    console.clear();
    let token = await getInput('\nInput token address: ');

    term.green('\n\nBlind Mode Activated\n\n');
    let tokenContract = new web3.eth.Contract(tokenAbi, token);
    let balBef = await BlindModeInternal(token,data.amountToUse,data.buyWith,data.gasPrice,data.slippage,delay);
    if(data.openSellMenu == true){
        let j = web3.utils.toWei(data.amountToUse, 'ether');
        let balanceNow = await tokenContract.methods.balanceOf(ICContractAddress).call();
        balanceNow = new BigNumber(balanceNow);
        balBefore = new BigNumber(balBef);
        let boughtFor = balanceNow.minus(balBefore);
        boughtFor = boughtFor.toString();
        await SellMenuAfterSnipe(token,data.buyWith,j,data.slippage,boughtFor);
    }


}



async function getInput(question) {
    term.cyan(question);
    let input = await term.inputField({
        style: term.white,
        selectedStyle: term.bold.white,
        
    }).promise;
    return input;
}


function parseTx(input) {
    if (input == '0x')
        return ['0x', []]
    let decodedData = abiDecoder.decodeMethod(input);
    let method = decodedData['name'];
    let params = decodedData['params'];

    return [method, params]
}


async function LiquidityBackRunner() {
    console.clear();

    let slippage;
    let amount;


    term.cyan('\nGas price , gas limit are automatic to ensure the tx is mined after the target tx\n');


    amount = await getInput('\ninput amount you want to use to buy in bnb: ');

    term.cyan('\n\ninput slippage (normal = 5) \n');
    await term.singleColumnMenu(['1', '10', '20', 'custom'], options).promise.then(async (answer) => {
        if(answer.selectedText === '1'){
            slippage = 1;
        }
        if(answer.selectedText === '10'){
            slippage = 10;
        }
        if(answer.selectedText === '20'){
            slippage = 20;
        }
        if(answer.selectedText === 'custom'){   
            let customSlippage = await getInput('\ninput slippage: ');
            slippage = customSlippage;
        }
    });

    let token = await getInput('\ninput token address: ');


    let rks = false;
    term.cyan('\n\nopen sell menu? (true or false)\n');
    await term.singleColumnMenu(['true', 'false'], options).promise.then(async (answer) => {
        if(answer.selectedText === 'true'){
            rks = true;
        }
        if(answer.selectedText === 'false'){
            rks = false;
        }
    });

    console.clear();
    term.cyan('\nScanning Mempool for tranactions...\n');
    let amountk = web3.utils.toWei(amount, 'ether');
    token = web3.utils.toChecksumAddress(token);
    await LiquidityBackRunnerMode(token, amountk, slippage);



}

async function LiquidityBackRunnerMode(toBuy,amount,slippage) {
    slippage = slippage.toString();
    let swapRaw = icMain.methods.BUY(toBuy,WBNBAddress,amount,slippage,routerAddress);
    let txx = {

        from: wallet.address,
        to: ICContractAddress,
        gasPrice: normalGas,
        gas: 2000000,
        data: swapRaw.encodeABI(),
        nonce: await web3.eth.getTransactionCount(wallet.address),
    }


    let signedTx;
    await web3Wss.eth.subscribe('pendingTransactions', (error, result) => {}).on('data', async (txn) => {
        let tx = await web3Wss.eth.getTransaction(txn);
        if(tx != null && tx.to == routerAddress){
            let [method, params] = parseTx(tx.input);
            if(method == 'addLiquidityETH'){
                let AddingLpToken = params[0].value;
                AddingLpToken = web3.utils.toChecksumAddress(AddingLpToken);
                if(AddingLpToken == toBuy){
                    txx.gasPrice =  tx.gasPrice;
                    signedTx = await wallet.signTransaction(txx);
                    signedTx = signedTx.rawTransaction;
                    term.green("\n\nLiquidity adding tx was found for the token\n");
                    term.green("\nTarget: " + txn)
                    term.white('\n\nToken: ' + AddingLpToken + '\n');
                    term.green('\nBack Runner Mode Activated\n');
                    web3Wss.eth.clearSubscriptions();
                    web3.eth.sendSignedTransaction(signedTx)
                    .on('transactionHash', (hash) => {
                        term.green("\nTxHash: " + hash + '\n');
                    })
                    .on('receipt', (receipt) => {
                        term.green('\nTx confirmed\n')
                        process.exit(0);
                    });
                }
            }
        }

    });
}

async function NormalMode() {
    console.clear();
    
    let data = {
        amountToUse: 0,
        buyWith: 0,
        gasPrice: 0,
        slippage: 0
    }



    term.cyan('\nselect the token you want to use to buy (eg: bnb) \n');
    let input = await term.singleColumnMenu(Object.keys(baseTokens), options).promise;
    input = input.selectedText
    data.buyWith = baseTokens[input];

    let amounts = await getInput(`\nInput the amount of ${input} you want to use: `);
    data.amountToUse = amounts;

    term.cyan('\n\nselect the gas price you want to use (eg: 10 gwei) \n');
    await term.singleColumnMenu(['5', '10', '20', 'custom'], options).promise.then(async (answer) => {
        if(answer.selectedText === '1'){
            data.gasPrice = '5';
        }
        if(answer.selectedText === '10'){
            data.gasPrice = '10';
        }
        if(answer.selectedText === '20'){
            data.gasPrice = '20';
        }
        if(answer.selectedText === 'custom'){   
            let customGasPrice = await getInput('\ninput gas price: ');
            data.gasPrice = customGasPrice;
        }
    });


    term.cyan('\nselect the slippage you want to use (eg: 5) \n');
    await term.singleColumnMenu(['1', '10', '20', 'custom'], options).promise.then(async (answer) => {
        if(answer.selectedText === '1'){
            data.slippage = '1';
        }
        if(answer.selectedText === '10'){
            data.slippage = '10';
        }
        if(answer.selectedText === '20'){
            data.slippage = '20';
        }
        if(answer.selectedText === 'custom'){   
            let customSlippage = await getInput('\ninput slippage: ');
            data.slippage = customSlippage.toString();
        }
    });

    let rks = false;
    term.cyan('\nopen sell menu? (true or false)\n');
    await term.singleColumnMenu(['true', 'false'], options).promise.then(async (answer) => {
        if(answer.selectedText === 'true'){
            rks = true;
        }
        if(answer.selectedText === 'false'){
            rks = false;
        }
    });
    

    console.clear();

    let token = await getInput('\ninput token address: ');

    token = web3.utils.toChecksumAddress(token);
    let tokenContract = new web3.eth.Contract(tokenAbi, token);

    let balBef = await NormalModeInternal(token,data.amountToUse,data.buyWith,data.gasPrice,data.slippage);



    if(rks == true){
        // SellMenuAfterSnipe(token,boughtFor,amount,slippage) {
        let j = web3.utils.toWei(data.amountToUse, 'ether');
        
        let balanceNow = await tokenContract.methods.balanceOf(ICContractAddress).call();
        balanceNow = new BigNumber(balanceNow);
        balBef = new BigNumber(balBef);
        let boughtFor = balanceNow.minus(balBef);
        boughtFor = boughtFor.toString();

        await SellMenuAfterSnipe(token,data.buyWith,j,data.slippage,boughtFor);
    }




}


async function NormalModeInternal(toBuy,amount,buyWith,gasPrice,slippage) {
    amount = web3.utils.toWei(amount, 'ether');
    buyWith = web3.utils.toChecksumAddress(buyWith);
    gasPrice = web3.utils.toWei(gasPrice.toString(), 'gwei');
    let SM = new web3.eth.Contract(tokenAbi, toBuy);

    let swapRaw = icMain.methods.BUY(toBuy,buyWith,amount,slippage.toString(),routerAddress);
    let tx = {
        from: wallet.address,
        to: ICContractAddress,
        gasPrice: gasPrice,
        gas: mainGasPrice,
        data: swapRaw.encodeABI(),
    }

    let signedTx = await wallet.signTransaction(tx);
    let balanceBefore;
    while(true){
        try {
            let gas = await web3.eth.estimateGas(tx);
            console.clear();
            term.green('\nTrading Enabled\n')
            break;
        } catch (error) {
            error = error.data;
            let time = new Date().getTime();
            let data = `\n${time}>Trading not possible. Reason = ${error}`;
            term.brightYellow(data);
            continue
        }
    } 

    await web3.eth.sendSignedTransaction(signedTx.rawTransaction)
    .on('transactionHash', async (hash) => {
        term.green("\nTxHash: " + hash + '\n');
        balanceBefore = await SM.methods.balanceOf(ICContractAddress).call();
    })
    .on('receipt', (receipt) => {
        term.green('\nTx confirmed\n');
        return true;
    });
    return balanceBefore;
}


async function AutoSell() {
    let data = {
        amountToSell: 0,
        sellFor: 0,
        gasPrice: 0,
        slippage: 0
    }
    console.clear();

    term.cyan('\nselect the token you want to sell for (eg: bnb) \n');
    let input = await term.singleColumnMenu(Object.keys(baseTokens), options).promise;
    input = input.selectedText
    data.sellFor = baseTokens[input];

    term.cyan('\nselect the gas price you want to use (eg: 10 gwei) \n');
    await term.singleColumnMenu(['5', '10', '20', 'custom'], options).promise.then(async (answer) => {
        if(answer.selectedText === '1'){
            data.gasPrice = '5';
        }
        if(answer.selectedText === '10'){
            data.gasPrice = '10';
        }
        if(answer.selectedText === '20'){
            data.gasPrice = '20';
        }
        if(answer.selectedText === 'custom'){   
            let customGasPrice = await getInput('\ninput gas price: ');
            data.gasPrice = customGasPrice;
        }
    });

    term.cyan('\nselect the slippage you want to use (eg: 5) \n');
    await term.singleColumnMenu(['1', '10', '20', 'custom'], options).promise.then(async (answer) => {
        if(answer.selectedText === '1'){
            data.slippage = '1';
        }
        if(answer.selectedText === '10'){
            data.slippage = '10';
        }
        if(answer.selectedText === '20'){
            data.slippage = '20';
        }
        if(answer.selectedText === 'custom'){   
            let customSlippage = await getInput('\ninput slippage: ');
            data.slippage = customSlippage.toString();
        }
    });

    console.clear();

    let amountInPercent = await getInput('\ninput the amount you want to sell in percent (eg: 1 - 100) ');
    console.clear();

    let token = await getInput('\ninput token address: ');


    await AutoSellInternal(token,data.sellFor,data.gasPrice,data.slippage,amountInPercent);

}

async function AutoSellInternal(token,sellFor,gasPrice,slippage,amountInPercent) {
    if(amountInPercent == '100'){
        amountInPercent = '0';
    }
    sellFor = web3.utils.toChecksumAddress(sellFor);
    gasPrice = web3.utils.toWei(gasPrice.toString(), 'gwei');

    let swapRaw = icMain.methods.SELL(token,sellFor,amountInPercent,slippage,routerAddress);
    let tx = {
        from: wallet.address,
        to: ICContractAddress,
        gasPrice: normalGas,
        gas: 1000000,
        data: swapRaw.encodeABI(),
    }

    let signedTx = await wallet.signTransaction(tx);


    term.on('key' , async function( name , matches , data ) {
        if(name === 'ENTER'){
            term.grabInput( false ) ;
            OpeningMenu();
            return;
        }
    } ) ;

    while(true){
        try {
            let gas = await web3.eth.estimateGas(tx);
            console.clear();
            term.green('\nTrading Enabled\n')
            break;
        } catch (error) {
            console.clear();
            error = error.toString();
            //time in utc
            let time = new Date().getTime();
            let data = `\n${time}>Trading not possible. Reason = ${error}`;
            term.brightYellow(data);
            continue
        }
    } 

    web3.eth.sendSignedTransaction(signedTx.rawTransaction)
    .on('transactionHash', (hash) => {
        term.green("\nTxHash: " + hash + '\n');
    })
    .on('receipt', (receipt) => {
        term.green('\nTx confirmed\n')
        term.green('\nSelling complete\n')
            term.grabInput( { mouse: 'button' } ) ;
        term.green('\nPress Enter go back continue\n')
        return true;
    });
}



function Sell() {

    term.cyan( '\n' ) ;
    term.cyan('Auto Sell => Sell all tokens as soon as trading is enabled or when taxes are in the specified range\n')
    term.cyan('\n')
     let items = [
        'Auto Sell',
        'Go Back',
        'Exit'
    ]

    term.singleColumnMenu( items , options , function(error , response) {
        console.log( '\n' ) ;
        if(response.selectedText == 'Exit'){
            process.exit();
        } else if(response.selectedText == 'Go Back'){
            OpeningMenu();
        } else if (response.selectedText == 'Auto Sell') {
            AutoSell();
        } else if(response.selectedText == 'Sell At Call (low level call)'){
            SellAtCall();
        }
    } ) ;
}

// same as ONSMCall but for sells
async function OnSMCall() {
    console.clear();
    let token = await getInput('\nInput token address: ');
    let Meth = false;
    let abi;
    try {
        abi = await getContractAbi(token);
        abi = JSON.parse(abi);
        abiDecoder.addABI(abi);
    } catch(e){
        Meth = true;
    };

    if(!Meth){

    let methods =  getContractMethods(abi);

    await term.gridMenu(methods, options).promise.then(async (answer) => {
        if(answer.selectedText === 'Go Back'){
            OpeningMenu();
        } else {
            let method = answer.selectedText;
            let pureMethod = method.split('(')[0];
            let params = method.split('(')[1].split(')')[0].split(','); 
            let methodParams = [];


            if(params[0] != ''){

                let customParam = false;
                term.green('Include Custom Params?')
                await term.singleColumnMenu(['   Yes   ','   Nah   '], options).promise.then(async (answer) => {
                    if(answer.selectedText === '   Yes   '){
                        customParam = true;
                    }
                    if(answer.selectedText === '   Nah   '){
                        customParam = false;
                    }
                });

                if(customParam){
                    for(let i = 0; i < params.length; i++){
                        let param = await getInput(`\ninput ${params[i]}  :`);
                        methodParams.push(param);
                    }
                } 
            
            }
            
            let data = {
                to: token,
                method: pureMethod,
                methodParams: methodParams
            }

            await OnSMCallInternal(data);
        }
    });

    } else {
        term.yellow("\nSeems like the contract is not verified\n")
        let methodId = await getInput('\nInput MethodId if you want to continue: ');
        let data = {
            to:token,
            methodId: methodId
        }
        await OnSMCallInternalMethodId(data)
    }
}

async function SellAtCallInternal(data){

    console.clear();

    let to = data.to;
    let method = data.method;
    let methodParamss = data.methodParams;
    let slippage;
    let gasLimit;
    let sellFor;
    let amountInPercent;

    term.cyan('\nInput the amount you want to sell in percent (eg: 1 - 100) ')
    amountInPercent = await getInput('\ninput the amount you want to sell in percent (eg: 1 - 100) ');
    slippage = await getInput('\ninput slippage: ');
    gasLimit = await getInput('\ninput gas limit: ');
    sellFor = await getInput('\ninput sell for address: ');

    sellFor = web3.utils.toChecksumAddress(sellFor);

    let swapRaw = icMain.methods.SELL(to,sellFor,amountInPercent,slippage,routerAddress);

    let tx = {
        from: wallet.address,
        to: ICContractAddress,
        gasPrice: web3.utils.toWei(gasPrice.toString(), 'gwei'),
        gas: gasLimit,
        data: swapRaw.encodeABI(),
        nonce: await web3.eth.getTransactionCount(wallet.address),
    }

    let signedTx = await wallet.signTransaction(tx);

    web3Wss.eth.subscribe('pendingTransactions',async function(error, result){

        let txData = web3Wss.eth.getTransaction(result);

        if(txData.to == ICContractAddress){
            let decoded = abiDecoder.decodeMethod(txData.input);
            let methodName = decoded.name;
            let methodParams = decoded.params;

            let allParamsMatch = true;

            if(method == methodName){
                console.log(methodParams.length)
                if(methodParams.length > 0){
                    for(let i = 0; i < methodParams.length; i++){
                        if(methodParamss[i].value != methodParams[i]){
                            allParamsMatch = false;
                        }
                    }
                }
            }

            if(allParamsMatch){
                tx.gas = txData.gas;
                signedTx = await wallet.signTransaction(tx);
                console.clear();
                web3.eth.clearSubscriptions();
                term.green('\nTarget Transaction Found\n')

                await web3.eth.sendSignedTransaction(signedTx)
                .on('transactionHash', (hash) => {
                    term.green("\nTxHash: " + hash + '\n');
                })
                .on('receipt', (receipt) => {
                    term.green('\nTx confirmed\n')
                    return true;
                });

            }

        

        }
    });

}

async function jk(){

    console.clear();

    let token = await getInput('\ninput token address: ');
    term.cyan('\n')
    token = web3.utils.toChecksumAddress(token);
    let abi = await getContractAbi(token);
    //convert abi to array
    abi = JSON.parse(abi);
    abiDecoder.addABI(abi);
    let methods = getContractMethods(abi);

    await term.gridMenu(methods, options).promise.then(async (answer) => {
        if(answer.selectedText === 'Go Back'){
            OpeningMenu();
        } else {
            let method = answer.selectedText;
            let pureMethod = method.split('(')[0];
            let params = method.split('(')[1].split(')')[0].split(','); 
            let methodParams = [];


            if(params[0] != ''){

                let customParam = false;

                if(customParam){
                    for(let i = 0; i < params.length; i++){
                        let param = await getInput(`\ninput ${params[i]}  :`);
                        methodParams.push(param);
                    }
                } 
            
            }
            
            let data = {
                to: token,
                method: pureMethod,
                methodParams: methodParams
            }

            await OnSMCallInternal(data);
        }
    })

}




async function OnSMCallInternal(data){

    let to = data.to;
    let method = data.method;
    let methodParams = data.methodParams;
    let gase;
    let gasPricee;
    let slippage;
    let amount;

    term.cyan('\nselect the gasPrice you want to use (eg: 5) \n');
    await term.singleColumnMenu(['5', '10', '20', 'custom'], options).promise.then(async (answer) => {
        if(answer.selectedText === '5'){
            gasPricee = '5';
        }
        if(answer.selectedText === '10'){
            gasPricee = '10';
        }
        if(answer.selectedText === '20'){
            gasPricee = '20';
        }
        if(answer.selectedText === 'custom'){   
            let customGas = await getInput('\ninput gas: ');
            gasPricee = customGas;
        }


    });

    console.log(gasPricee)

    gase = await getInput('\ninput gas (eg: 1000000): ');
    console.clear();

    term.cyan('\nselect the slippage you want to use (eg: 1) \n');
    await term.singleColumnMenu(['1', '10', '20', 'custom'], options).promise.then(async (answer) => {
        if(answer.selectedText === '1'){
            slippage = '1';
        }
        if(answer.selectedText === '10'){
            slippage = '10';
        }
        if(answer.selectedText === '20'){
            slippage = '20';
        }
        if(answer.selectedText === 'custom'){   
            let customSlippage = await getInput('\ninput slippage: ');
            slippage = customSlippage.toString();
        }
    });

    let ToBuyWith = await getInput('\ninput the token address to buy with (eg: WBNB): ');
    ToBuyWith = web3.utils.toChecksumAddress(ToBuyWith);

    amount = await getInput('\n\nAmount to use in that token: ');

    amount = web3.utils.toWei(amount, 'ether');

    let swapTx = icMain.methods.BUY(to,ToBuyWith,amount,slippage,routerAddress);
    slippage = slippage.toString();

    let tx = {
        from: wallet.address,
        to: ICContractAddress,
        data: swapTx.encodeABI(),
        gas: gase,
        gasPrice: web3.utils.toWei(gasPricee, 'gwei'),
        nonce: await web3.eth.getTransactionCount(wallet.address)
    }

    let signedTx = await wallet.signTransaction(tx);
    signedTx = signedTx.rawTransaction
    let active;
    console.clear();
    term.green("\n\nScearching mempool for the specifyed call\n\n");
    web3Wss.eth.subscribe('pendingTransactions').on('data', async (tx) => {
        let txData = await web3Wss.eth.getTransaction(tx);
        try {
            let m = txData.to;
        } catch(e){
            return;
        }
        if(txData.to == to){
            let decoded = abiDecoder.decodeMethod(txData.input);
            let methodr = decoded.name;
            let params = decoded.params;
            let allParamsMatch = true;  
            if(method == methodr){
                if(methodParams.length > 0){
                    for(let i = 0; i < methodParams.length; i++){
                        if(params[i].value != methodParams[i]){
                            allParamsMatch = false;
                        }
                    }
                }
            }
            if(allParamsMatch && !active){
                active = true;
                // unsubscribe all events
                web3Wss.eth.clearSubscriptions();
                term.green("Target Transaction Was Found!");
                term.green("\n\n");
                term.yellow("Target Tx Hash: ");
                term.yellow(tx);
                term.green("\n");
                term.green('\n')
                //send tx
                await web3.eth.sendSignedTransaction(signedTx)
                .on('transactionHash', (hash) => {
                    term.green("Tx Hash: ");
                    term.green(hash);
                    term.green("\n");
                    term.green('\n')
                })
                .on('receipt', (receipt) => {
                    term.green("Transaction Was Successful!\n");
                    process.exit();
                })

            }

        }
    });

}


async function OnSMCallInternalMethodId(data){

    let to = data.to;
    let methodId = data.methodId;
    let gase;
    let gasPricee;
    let slippage;
    let amount;

    term.cyan('\nselect the gasPrice you want to use (eg: 5) \n');
    await term.singleColumnMenu(['5', '10', '20', 'custom'], options).promise.then(async (answer) => {
        if(answer.selectedText === '5'){
            gasPricee = '5';
        }
        if(answer.selectedText === '10'){
            gasPricee = '10';
        }
        if(answer.selectedText === '20'){
            gasPricee = '20';
        }
        if(answer.selectedText === 'custom'){   
            let customGas = await getInput('\ninput gas: ');
            gasPricee = customGas;
        }


    });

    console.log(gasPricee)

    gase = await getInput('\ninput gas (eg: 1000000): ');
    console.clear();

    term.cyan('\nselect the slippage you want to use (eg: 1) \n');
    await term.singleColumnMenu(['1', '10', '20', 'custom'], options).promise.then(async (answer) => {
        if(answer.selectedText === '1'){
            slippage = '1';
        }
        if(answer.selectedText === '10'){
            slippage = '10';
        }
        if(answer.selectedText === '20'){
            slippage = '20';
        }
        if(answer.selectedText === 'custom'){   
            let customSlippage = await getInput('\ninput slippage: ');
            slippage = customSlippage.toString();
        }
    });

    let ToBuyWith = await getInput('\ninput the token address to buy with (eg: WBNB): ');
    ToBuyWith = web3.utils.toChecksumAddress(ToBuyWith);

    amount = await getInput('\n\nAmount to use in that token: ');

    amount = web3.utils.toWei(amount, 'ether');

    let swapTx = icMain.methods.BUY(to,ToBuyWith,amount,slippage,routerAddress);
    slippage = slippage.toString();

    let tx = {
        from: wallet.address,
        to: ICContractAddress,
        data: swapTx.encodeABI(),
        gas: gase,
        gasPrice: web3.utils.toWei(gasPricee, 'gwei'),
        nonce: await web3.eth.getTransactionCount(wallet.address)
    }

    let signedTx = await wallet.signTransaction(tx);
    signedTx = signedTx.rawTransaction
    let active;
    console.clear();
    term.green("\n\nScearching mempool for the specifyed call\n\n");
    web3Wss.eth.subscribe('pendingTransactions').on('data', async (tx) => {
        let txData = await web3Wss.eth.getTransaction(tx);
        try {
            let m = txData.to;
        } catch(e){
            return;
        }
        if(txData.to == to){
            let allParamsMatch = false;  
            let Idr = txData.input.slice(0, 10)
            if(Idr == methodId){
                allParamsMatch = true;
            }
            if(allParamsMatch && !active){
                active = true;
                // unsubscribe all events
                web3Wss.eth.clearSubscriptions();
                term.green("Target Transaction Was Found!");
                term.green("\n\n");
                term.yellow("Target Tx Hash: ");
                term.yellow(tx);
                term.green("\n");
                term.green('\n')
                //send tx
                await web3.eth.sendSignedTransaction(signedTx)
                .on('transactionHash', (hash) => {
                    term.green("Tx Hash: ");
                    term.green(hash);
                    term.green("\n");
                    term.green('\n')
                })
                .on('receipt', (receipt) => {
                    term.green("Transaction Was Successful!");
                    process.exit();
                })

            }

        }
    });

}

async function Snipe() {
    // Sniper input menu



    term.cyan( '\n' ) ;
    term.cyan ('Blind Mode => Buy as soon as you enter the token address')
    term.cyan('\n');
    term.cyan('Liquidity Back Runner Mode => Buy in the same block as in which liquidity was added')
    term.cyan('\n')
    term.cyan('Normal Mode => Buys as soon as the trading is enabled and when taxes are below the specified threshold')
    term.cyan('\n')
    term.cyan('On Smart Contract Call => Front run or Back run buy transaction on the specified smart contract call')

    let items = [
        'Blind Mode' ,
        'Liquidity Back Runner Mode ' ,
        'Normal Mode' ,
        'On Smart Contract Call',
        'Go Back',
        'Exit'
    ]
    
    term.cyan( '\n' ) ;
    term.cyan( '\n' ) ;


    term.singleColumnMenu( items , options ,async function(error , response) {
        console.log('\n')
        
        if(response.selectedText == 'Go Back'){
            console.clear();
            OpeningMenu()
        } else if(response.selectedText == "Exit"){
            process.exit()
        } else if(response.selectedIndex == 0){
            BlindMode();
        } else if(response.selectedText == 'Liquidity Back Runner Mode'){
            LiquidityBackRunner();
        } else if(response.selectedText == 'Normal Mode'){
            NormalMode();
        } else if(response.selectedText == "Liquidity Back Runner Mode "){
            LiquidityBackRunner();
        } else if ( response.selectedText == "Go Back"){
            OpeningMenu()
        } else {
            OnSMCall();
        }
    })

}




async function BuyOnPresaleInternal() {

    console.clear();

    let amount = await getInput('\nInput the amount you want to use in BNB: ');
    let gasPrice = await getInput('\nInput the gas price you want to use: ');
    let token = await getInput('\nInput the presale address: ');
    
    token = web3.utils.toChecksumAddress(token);
    amount = web3.utils.toWei(amount.toString(), 'ether');

    let tx = {
        from: wallet.address,
        to: token,
        gasPrice: web3.utils.toWei(gasPrice.toString(), 'gwei'),
        value: amount,
        gas: mainGasPrice,
    }

    let signedTx = await wallet.signTransaction(tx);

    while(true) {
        try {
            let gas = await web3.eth.estimateGas(tx);
            console.clear();
            term.green('\nPresale opened\n')
            break;
        } catch (error) {
            //time in hours, minutes, seconds
            let time = new Date().toLocaleTimeString();
            time = `[${time}]`;
            let data = `\n${time} Presale not open yet. or some other reason.`;
            term.brightYellow(data);
            continue
        }
    }

    web3.eth.sendSignedTransaction(signedTx.rawTransaction)
    .on('transactionHash', (hash) => {
        term.green("\nTxHash: " + hash + '\n');
    }
    ).on('receipt', (receipt) => {
        term.green('\nTx confirmed\n')
        process.exit();
    });



}


function BuyOnPresale() {
    console.log('\n')
    term.cyan('Select the platform in which you want to buy the token')
    term.cyan('\n')


    let items = [
        'Buy on DxSale',
        'Buy on Pink Sale',
        'Go Back',
        'Exit'
    ]

    term.singleColumnMenu( items , options , function(error , response) {
        console.log( '\n' ) ;
        if(response.selectedText == 'Exit'){
            process.exit();
        } else if(response.selectedText == 'Go Back'){
            console.clear();
            OpeningMenu();
        } else if(response.selectedText == 'Buy on DxSale' || response.selectedText == 'Buy on Pink Sale'){
            BuyOnPresaleInternal();
        }
    })

}

async function SellAfterPinkSale() {

    console.clear();

    let presaleAddress = await getInput('\nInput the presale address: ');
    let token = await getInput('\nInput the token address that you will get after claiming: ');
    let gas = await getInput('\nInput the gas price you want to use: ');
    let slippage = await getInput('\nInput the slippage while selling: ');

    token = web3.utils.toChecksumAddress(token);
    presaleAddress = web3.utils.toChecksumAddress(presaleAddress);
    gas = web3.utils.toWei(gas.toString(), 'gwei');
    let presaleContract = new web3.eth.Contract(SaleAbi, presaleAddress);

    let claim = presaleContract.methods.claim();

    let tx = {
        from: wallet.address,
        to: presaleAddress,
        gasPrice: gas,
        gas: mainGasPrice,
        data: claim.encodeABI()
    }

    while(true) {
        try {
            let gas = await web3.eth.estimateGas(tx);
            tx.gas = gas;
            console.clear();
            term.green('\nPresale ended\n')
            break;
        } catch (error) {
            //time in hours, minutes, seconds
            let time = new Date().toLocaleTimeString();
            time = `[${time}]`;
            let data = `\n${time} Presale not ended yet. or some other reason.`;
            term.brightYellow(data);
            continue
        }
    }

    let signedTx = await wallet.signTransaction(tx);

    web3.eth.sendSignedTransaction(signedTx.rawTransaction)
    .on('transactionHash', (hash) => {
        term.green("\nTxHash: " + hash + '\n');
    }
    ).on('receipt', async (receipt) => {
        term.green('\nTx confirmed\n')
        term.green('\nSelling token\n')
        await transfer(token, ICContractAddress,0);
        BlindModeInternal(token,WBNBAddress,'5',slippage)
        process.exit();
    });

}

async function transfer(token,to,amount) {
    let tokenc = new web3.eth.Contract(TokenAbi, token);
    if(amount == 0) {
        let balance = await tokenc.methods.balanceOf(wallet.address).call();
        amount = balance;
    }
    let transfer = tokenc.methods.transfer(to, amount);

    let tx = {
        from: wallet.address,
        to: token,
        gasPrice: web3.utils.toWei('5', 'gwei'),
        gas: mainGasPrice,
        data: transfer.encodeABI()
    }

    let signedTx = await wallet.signTransaction(tx);

    web3.eth.sendSignedTransaction(signedTx.rawTransaction)
    .on('transactionHash', (hash) => {
        term.green("\nTxHash: " + hash + '\n');
    })
    .on('receipt', (receipt) => {
        term.green('\nTx confirmed\n')
        term.green('\nSent tokens to IC Main Smart Contract\n')
        return true;
    });


}




async function SellAfterDxSale() {

    console.clear();

    let presaleAddress = await getInput('\nInput the presale address: ');
    let token = await getInput('\nInput the token address that you will get after claiming: ');
    let gas = await getInput('\nInput the gas price you want to use: ');
    let slippage = await getInput('\nInput the slippage while selling: ');

    token = web3.utils.toChecksumAddress(token);
    presaleAddress = web3.utils.toChecksumAddress(presaleAddress);

    let presaleContract = new web3.eth.Contract(SaleAbi, presaleAddress);

    let claim = presaleContract.methods.claimRefund();

    let tx = {
        from: wallet.address,
        to: presaleAddress,
        gasPrice: normalGas,
        gas: mainGasPrice,
        data: claim.encodeABI()
    }

    while(true) {
        try {
            let gas = await web3.eth.estimateGas(tx);
            console.clear();
            term.green('\nPresale ended\n')
            break;
        } catch (error) {
            //time in hours, minutes, seconds
            let time = new Date().toLocaleTimeString();
            time = `[${time}]`;
            let data = `\n${time} Presale not ended yet. or some other reason.`;
            term.brightYellow(data);
            continue
        }
    }

    web3.eth.sendSignedTransaction(signedTx.rawTransaction)
    .on('transactionHash', (hash) => {
        term.green("\nTxHash: " + hash + '\n');
    }
    ).on('receipt', async (receipt) => {
        term.green('\nTx confirmed\n')
        term.green('\nSelling token\n')
        await transfer(token, ICContractAddress,0);
        process.exit();
    });

}

async function SellAfterPresale(){
    term.cyan('\n')
    term.cyan('Select the platform in which you want to sell the token')
    term.cyan('\n')

    let items  = [
        'Sell from DxSale',
        'Sell from Pink Sale',
        'Go Back',
        'Exit'
    ]

    term.singleColumnMenu( items , options , function(error , response) {
        console.log( '\n' ) ;
        if(response.selectedText == 'Exit'){
            console.clear();
            process.exit();
        } else if(response.selectedText == 'Go Back'){
            console.clear();
            OpeningMenu();
        } else if(response.selectedText == 'Sell from DxSale'){
            SellAfterDxSale();
        } else {
            SellAfterPinkSale();
        }
    } ) ;

}

term.on('key' , function( name , matches , data ) {
    if( name == 'CTRL_C' ) {
        process.exit()
    }
} ) ;



async function SellMenuAfterPresale(token,slippage) {

    term.cyan('\n')
    //displays the current value of token and uses hot keys or events to sell
    let tokenc = new web3.eth.Contract(tokenAbi, token);
    let balance = await tokenc.methods.balanceOf(ICContractAddress).call();
    let status = true;

    let tcChart = []


    // event lister to check keyboard on selling
    // s = sell all
    // 1-9 = sell 10 - 90 % of the balance
    term.grabInput( { mouse: 'button' } ) ;
    term.on('key' , async function( name , matches , data ) {
        if( name == 'f' ) {
            status = false;
            console.clear();
            await SellAmount(token,boughtFor,'0',slippage);
            status = true;
        } else if( name == '1'){
            status = false;
            console.clear();
            await SellAmount(token,boughtFor,'10',slippage);
        } else if( name == '2'){
            status = false;
            console.clear();
            await SellAmount(token,boughtFor,'20',slippage);
        } else if( name == '3'){
            status = false;
            console.clear();
            await SellAmount(token,boughtFor,'30',slippage);
        } else if( name == '4'){
            status = false;
            console.clear();
            await SellAmount(token,boughtFor,'40',slippage);
        } else if( name == '5'){
            status = false;
            console.clear();
            await SellAmount(token,boughtFor,'50',slippage);
        } else if( name == '6'){
            status = false;
            console.clear();
            await SellAmount(token,boughtFor,'60',slippage);
        } else if( name == '7'){
            status = false;
            console.clear();
            await SellAmount(token,boughtFor,'70',slippage);
        } else if( name == '8'){
            status = false;
            console.clear();
            await SellAmount(token,boughtFor,'80',slippage);
            status = true;
        } else if( name == '9'){
            status = false;
            console.clear();
            await SellAmount(token,boughtFor,'90',slippage);
            status = true;
        }
    } ) ;

    while(status) {
        let currentValue = await Router.methods.getAmountsOut(balance,[token,WBNBAddr]).call();
        let currentValueBought = currentValue[1];
        currentValue = web3.utils.fromWei(currentValueBought, 'ether');
        
        tcChart.push(currentValueBought)
        
        if(chart.length > 100){
            tcChart.shift()
        }

        let time = new Date().toLocaleTimeString();
        time = `[${time}]`;

        const config = {
             padding: '',
                colors : [
      
                    asciichart.green
                ],
                height : 10
        }

        console.clear();
        if(status) {
            console.log(asciichart.plot(tcChart,config))
            term.table( [
                    [ 'time'  ,  `current Value In BNB`, ] ,
                    [ time  , currentValue ] ,
                ] , {
                    hasBorder: true ,
		            contentHasMarkup: true ,
		            borderChars: 'lightRounded' ,
                    width: 60 ,
                    fit: true
                }   
            ) ;

        }

        term.cyan('\n')
        term.cyan('\n')
    }
}



async function SellMenuAfterSnipe(token,boughtFor,amount,slippage,bf) {


    term.cyan('\n')

    //displays the current value of token and uses hot keys or events to sell
    let tokenc = new web3.eth.Contract(tokenAbi, token);
    let boughtc = new web3.eth.Contract(tokenAbi, boughtFor);
    let name = await boughtc.methods.name().call();
    let balance = bf.toString();
    let status = true;
    // event lister to check keyboard on selling
    // s = sell all
    // 1-9 = sell 10 - 90 % of the balance
    term.grabInput( { mouse: 'button' } ) ;
    term.on('key' , async function( name , matches , data ) {
        if( name == 'f' ) {
            status = false;
            console.clear();
            await SellAmount(token,boughtFor,'0',slippage);
            process.exit();
        } else if( name == '1'){
            status = false;
            console.clear();
            await SellAmount(token,boughtFor,'10',slippage);
            status = true;
        } else if( name == '2'){
            status = false;
            console.clear();
            await SellAmount(token,boughtFor,'20',slippage);
            status = true;
        } else if( name == '3'){
            status = false;
            console.clear();
            await SellAmount(token,boughtFor,'30',slippage);
            status = true;
        } else if( name == '4'){
            status = false;
            console.clear();
            await SellAmount(token,boughtFor,'40',slippage);
            status = true;
        } else if( name == '5'){
            status = false;
            console.clear();
            await SellAmount(token,boughtFor,'50',slippage);
            status = true;
        } else if( name == '6'){
            status = false;
            console.clear();
            await SellAmount(token,boughtFor,'60',slippage);
            status = true;
        } else if( name == '7'){
            status = false;
            console.clear();
            await SellAmount(token,boughtFor,'70',slippage);
            status = true;
        } else if( name == '8'){
            status = false;
            console.clear();
            await SellAmount(token,boughtFor,'80',slippage);
            status = true;
        } else if( name == '9'){
            status = false;
            console.clear();
            await SellAmount(token,boughtFor,'90',slippage);
            status = true;
        }
    } ) ;


    while(true) {
        let currentValue = await Router.methods.getAmountsOut(balance,[token,boughtFor]).call();
        let currentValueBought = currentValue[1];
        currentValue = web3.utils.fromWei(currentValueBought, 'ether');
        let m = web3.utils.fromWei(amount, 'ether');
        // the amount increased or decreased by xes

        let multiplier = ( currentValue / m);
        let priviousValue = chart[chart.length-1];
        if(priviousValue != currentValueBought){
            chart.push(multiplier)
        }
        if(chart.length > 74){
            chart.shift()
        }


        multiplier = multiplier.toFixed(4);

        multiplier = `${multiplier}x`;

        let time = new Date().toLocaleTimeString();
        time = `[${time}]`;

        const config = {
             padding: '',
                colors : [
      
                    asciichart.green
                ],
                height : 10,


        }

        if(status) {
            console.clear();
            console.log(asciichart.plot(chart,config))
            term.table( [
                    [ 'time' , 'multiplier' ,  `current Value In ${name}`, ] ,
                    [ time , multiplier , currentValue ] ,
                ] , {
                    hasBorder: true ,
		            contentHasMarkup: true ,
		            borderChars: 'lightRounded' ,
                    width: 80 ,
                    fit: true
                }   
            ) ;

            term.green('\n Press F to sell 100% of your balance')
            term.green('\n Press 1-9 to sell 10-90% of your balance')

        }

    }
}


async function SellAmount(token,sellTo,amount,slippage){

    


    let swapTx = icMain.methods.SELL(token,sellTo,amount,slippage,routerAddress);

    let tx = {
        from: wallet.address,
        to: ICContractAddress,
        gasPrice: normalGas,
        gas: mainGasPrice,
        data: swapTx.encodeABI(),
        nonce: await web3.eth.getTransactionCount(wallet.address)
    }

    let signedTx = await wallet.signTransaction(tx);

    await web3.eth.sendSignedTransaction(signedTx.rawTransaction)
    .on('transactionHash', (hash) => {
        if(amount == '0'){
        term.green('Selling 100% of your balance\n')
    } else {
        term.green(`\nSelling ${amount}% of your balance\n`)
    }
        term.green("\nTxHash: " + hash + '\n');
    }
    ).on('receipt', async (receipt) => {
        term.green('\nTx confirmed\n')
        return true;
    });
}

async function ManageIC(){
    
    console.clear();
    term.cyan('\n')

    term.bold.bold.red(figlet.textSync('Manage Titan Smart Contract', {
        font: 'Standard',
        horizontalLayout: 'default',
        verticalLayout: 'default',
        width: 80,
        whitespaceBreak: true
    }));

    let items = [
        'Withdraw BNB',
        'Withdraw Any Other Token',
        'Deposit BNB',
        'Go Back',
        'Exit'
    ]

    let WBNB = new web3.eth.Contract(tokenAbi, WBNBAddress);
    let WBNBBalance = await WBNB.methods.balanceOf(ICContractAddress).call();
    WBNBBalance = web3.utils.fromWei(WBNBBalance, 'ether');
    term.green('\n\nWBNB Balance: ' + WBNBBalance + '\n');

    term.singleColumnMenu(items,options,(err, response) => {
        
        if(response.selectedText == 'Go Back'){
            OpeningMenu();
        } else if(response.selectedText == 'Exit'){
            console.clear();
            process.exit();
        } else if(response.selectedText == "Deposit BNB"){
            DepositBNB();
        } else if(response.selectedText == "Withdraw BNB"){
            WithdrawBNB();
        } else if(response.selectedText == "Withdraw Any Other Token"){
            WithdrawAnyOtherToken();
        }
        
    });

}

async function DepositBNB() {

    console.clear();
    term.cyan('\n')

    let balanceW = await web3.eth.getBalance(wallet.address);

    term.green('\nYour Balance: ' + web3.utils.fromWei(balanceW, 'ether') + '\n');

    let amount = await getInput('\nHow much WBNB do you want to deposit?: ');

    let WBNB = new web3.eth.Contract(tokenAbi, WBNBAddress);

    term.green('\n\nWrapping BNB\n');

    let tx = {
        from: wallet.address,
        to: WBNBAddress,
        gasPrice: web3.utils.toWei('10', 'gwei'),
        gas: mainGasPrice,
        value: web3.utils.toWei(amount, 'ether')
    }

    let signedTx = await wallet.signTransaction(tx);

    let data = web3.eth.sendSignedTransaction(signedTx.rawTransaction)
    .on('transactionHash', (hash) => {
        term.green("\nWrappingTxHash: " + hash + '\n');
    }
    ).on('receipt', async (receipt) => {
        term.green('\nTx confirmed\n')
        term.green('\nDepositing WBNB\n')
        let sendTx = WBNB.methods.transfer(ICContractAddress,web3.utils.toWei(amount, 'ether'));
        let signedTx = await wallet.signTransaction({
            from: wallet.address,
            to: WBNB.options.address,   
            gasPrice: normalGas,
            gas: mainGasPrice,
            data: sendTx.encodeABI()
        });

        web3.eth.sendSignedTransaction(signedTx.rawTransaction)
        .on('transactionHash', (hash) => {
            term.green("\nTxHash: " + hash + '\n');
        }
        ).on('receipt', async (receipt) => {
            term.green('\nTx confirmed\n')
            term.green('\nDeposit Successful\n')

            await sleep(1000);
            ManageIC();

            return true;
        });
    });

}

async function WithdrawBNB() {
    
        console.clear();
        term.cyan('\n')
    
        let amount = await getInput('How much WBNB do you want to withdraw?: ');
        term('\n');
        let WBNB = new web3.eth.Contract(tokenAbi, WBNBAddress);
        let WBNBBalance = await WBNB.methods.balanceOf(ICContractAddress).call();
        WBNBBalance = web3.utils.fromWei(WBNBBalance, 'ether');
        term.green('\n\nWBNB Balance: ' + WBNBBalance);
    
        if(WBNBBalance < amount){
            term.red('\n\nInsufficient Funds\n');
            await sleep(1000);
            ManageIC();
        } else {
            term.green('\n\nWithdrawing BNB\n');

            amount = web3.utils.toWei(amount, 'ether');

            let Tx = icMain.methods.takeOutTokens(WBNBAddress,amount);

            let tx = {
                from: wallet.address,
                to: ICContractAddress,
                gasPrice: normalGas,
                gas: mainGasPrice,
                data: Tx.encodeABI()
            }

            let signedTx = await wallet.signTransaction(tx);

            web3.eth.sendSignedTransaction(signedTx.rawTransaction)
            .on('transactionHash', (hash) => {
                term.green("\nWithdrawTxHash: " + hash + '\n');
            }
            ).on('receipt', async (receipt) => {
                term.green('\nTx confirmed\n')
                term.green('\nWithdrew WBNB \n')
    
                term.green('\nUnwrapping\n');

                let unWrap = WBNB.methods.withdraw(amount);

                let signedTx = await wallet.signTransaction({
                    from: wallet.address,
                    to: WBNB.options.address,
                    gasPrice: normalGas,
                    gas: mainGasPrice,
                    data: unWrap.encodeABI()
                });

                web3.eth.sendSignedTransaction(signedTx.rawTransaction)
                .on('transactionHash', (hash) => {
                    term.green("\nUnwrapTxHash: " + hash + '\n');
                }
                ).on('receipt', async (receipt) => {
                    term.green('\nTx confirmed\n')

                    term.green('\nUnwrapped\n')

                    term.green('\nWithdraw Successful\n')
                    await sleep(2000);
                    ManageIC();
                
                });
            });
            }       

} 

async function WithdrawAnyOtherToken() {

    console.clear();
    term.cyan('\n')

    let token = await getInput('Enter the address of the token you want to withdraw: ');

    let tokenC = new web3.eth.Contract(tokenAbi, token);

    let tokenName = await tokenC.methods.name().call();
    let balance = await tokenC.methods.balanceOf(ICContractAddress).call();
    balance = web3.utils.fromWei(balance, 'ether');
    term.green('\n\n' + tokenName + ' Balance: ' + balance + '\n');

    let amount = await getInput('\nHow much ' + tokenName + ' do you want to withdraw?: ');

    term('\n');

    if(balance < amount){
        term.red('\nInsufficient Funds\n');
        await sleep(1000);
        ManageIC();
    } else {
        
        amount = web3.utils.toWei(amount, 'ether');

        let Tx = icMain.methods.takeOutTokens(token,amount);

        let tx = {
            from: wallet.address,
            to: ICContractAddress,
            gasPrice: normalGas,
            gas: mainGasPrice,
            data: Tx.encodeABI()
        }

        let signedTx = await wallet.signTransaction(tx);

        web3.eth.sendSignedTransaction(signedTx.rawTransaction)
        .on('transactionHash', (hash) => {
            term.green("\nWithdrawTxHash: " + hash + '\n');
        })
        .on('receipt', async (receipt) => {
            term.green('\nTx confirmed\n')
            term.green('\nWithdrew ' + tokenName + '\n')

            term.green('\nSuccess\n');
            await sleep(2000);
            ManageIC();
        });

    }


}
    




async function AutoSniper() {
    term.cyan('\n')

    term.cyan.bold("\nPlease wait until the next update to use this feature.\n")
    await sleep(3000);
    OpeningMenu();
    return true;

    term.cyan('\n')

    let items = [
        'Auto Sniper' ,
        'Aper (watch new tokens)' ,
        'Go Back',
        'Exit'
    ]

    term.singleColumnMenu( items , options , function(error , response) {
        console.log( '\n' ) ;
        if(response.selectedText == 'Exit'){
            process.exit();
        } else if(response.selectedText == 'Go Back'){
            console.clear();
            OpeningMenu();
        } else if (response.selectedText == "Aper (watch new tokens)"){
            NewTokens()
        }
    }) ;
}

async function buy(token,amount,slippage,routerAddress){

    let swapTx = icMain.methods.BUY(token,WBNBAddress,amount,slippage,routerAddress);


    let tx = {
        from: wallet.address,
        to: ICContractAddress,
        gasPrice: web3.utils.toWei('10', 'gwei'),
        gas: mainGasPrice,
        data: swapTx.encodeABI()
    }

    let signedTx = await wallet.signTransaction(tx);

    await web3.eth.sendSignedTransaction(signedTx.rawTransaction)
    .on('transactionHash', (hash) => {
        term.green("\nSwapTxHash: " + hash + '\n');
    }
    ).on('receipt', async (receipt) => {
        term.green('\nTx confirmed\n')
        term.green('\nSwapped\n')
        return true;
    });

    return true;

}

async function sell(signedTx){

    


    await web3.eth.sendSignedTransaction(signedTx.rawTransaction)
    .on('transactionHash', (hash) => {
        term.green("\nSwapTxHash: " + hash + '\n');
    })
    .on('receipt', async (receipt) => {
        term.green('\nTx confirmed\n')
        term.green('\nSwapped\n')
        return true;
    })

    return true;
}

async function start(token,amount,slippage){

    await buy(token,amount,slippage,routerAddress);

    let swapTx = icMain.methods.SELL(token,WBNBAddress,'0',slippage,routerAddress);

    let txr = {
        from: wallet.address,
        to: ICContractAddress,
        gasPrice: web3.utils.toWei('10', 'gwei'),
        gas: mainGasPrice,
        data: swapTx.encodeABI()

    }

    let signedTx = await wallet.signTransaction(txr);

    let safeMethods = [
        'approve',
        'transfer',
        'transferFrom',
        'increaseAllowance',
        'decreaseAllowance',
        'transferOwnership',
    ]

    // subscribe pending transactions
    term.green('\nScaning mempool for rugged transactions\n')
    web3Wss.eth.subscribe('pendingTransactions', async (error, result) => {})
    .on('data', async (txHash) => {
        let tx = await web3.eth.getTransaction(txHash);
        try {
            let m = tx.to;
        } catch(e){
            return
        }
        if(tx.to == token){
            // add abi
            let [method,params] = parseTx(tx.input);

            if(safeMethods.includes(method)){}
            else{
                sell(signedTx);
            }
        } else if(tx.to == routerAddress){
            let [method,params] = parseTx(tx);
            if(method == 'removeLiquidityETH' || method == 'removeLiquidityETHSupportingFeeOnTransferTokens' || method == 'removeLiquidity' || method == 'removeLiquidityETHWithPermitSupportingFeeOnTransferTokens' || method == 'removeLiquidityETHWithPermit' || method == 'removeLiquidityWithPermit'){
                let remtoken;
                for(let i = 0 ; i < params.length ; i++){
                    if(params[i].name == 'token' || params[i].name == 'tokenA' || params[i].name == 'tokenB'){
                        if(params[i].value == token){
                            remtoken = true;
                        }
                    }
                }
            }

            if(remtoken){
                sell(signedTx);
            }
        } 

    })



}

async function NewTokens() {
    console.clear();

    term.bgGreen.black('Scanning for new tokens...\n')

    // lisen for new token events on factory
    let factory = new web3Wss.eth.Contract(FactoryAbi, '0xB7926C0430Afb07AA7DEfDE6DA862aE0Bde767bc');
    let WBNBAddr = WBNBAddress

    const log = (token,name,symbol,buyTax,sellTax,tradeStatus) => {
    term.green('\n\nToken Found: ' + name + '\n');
    term.table([
        ['Token Address', "Name", "Symbol", "Buy Tax", "Sell Tax","Trade Status"],
        [token, name, symbol, buyTax, sellTax,tradeStatus]
    ],{
        width: 130
        
    })
    }
    let amount = web3.utils.toWei('0.00000001', 'ether');

    // let swapTx = await icMain.methods.HoneyPot('0xDAcbdeCc2992a63390d108e8507B98c7E2B5584a',amount,routerAddress).call({
    //             from: wallet.address
    // });



    let buyTax = '1';
    let sellTax = '2';
    // convert 99 to 9.9%
    buyTax = (buyTax * 100) / 1000;
    sellTax = (sellTax * 100) / 1000;
    // round significant digits

    buyTax = buyTax.toFixed(0);
    sellTax = sellTax.toFixed(0);

    // table
    term.green('\n\n')

    log('0xDAcbdeCc2992a63390d108e8507B98c7E2B5584a','WBNB','WBNB',buyTax,sellTax,"Swap Ok")
    await start('0xDAcbdeCc2992a63390d108e8507B98c7E2B5584a',web3.utils.toWei('0.00001','ether'),'100');

    // factory.events.PairCreated({
    //     fromBlock: 'latest'

    // }, async (error, event) => {
    //     if(error){
    //         console.log(error);
    //     } else {
    //         let token0 = event.returnValues.token0;
    //         let token1 = event.returnValues.token1;
    //         let pair = event.returnValues.pair;
    //         if(token0 != WBNBAddr && token1 != WBNBAddr){
    //         }
    //         let token = token0 == WBNBAddr ? token1 : token0;

    //         let tokenContract = new web3Wss.eth.Contract(tokenAbi, token);  

    //         let tokenName = await tokenContract.methods.name().call();
    //         let tokenSymbol = await tokenContract.methods.symbol().call();

    //         let swapTx = await icMain.methods.HoneyPot(token,amount,routerAddress).call({
    //             from: wallet.address
    //         });
    //         console.log(swapTx)
    //         log(token,tokenName,tokenSymbol,'10',swapTx);


    //     }

    // });

}

async function TrackerBot(){

    console.clear();
    term.green("\nFront running requires private node with low latency")
    term.green("\nIf you are using a public node, please consider upgrading\n")

    await term.singleColumnMenu([
        'Tracker Bot',
        'Go Back',
        'Exit'
    ],options).promise.then(async (response) => {
        if(response.selectedIndex == 0){
            await TrackerBotS();
        } else if(response.selectedIndex == 1){
            await OpeningMenu();
        } else if(response.selectedIndex == 2){
            process.exit();
        }
    })


}


async function TrackerBotS() {




    console.clear()

    term.cyan('\n')
    term.green("Tracker Bot\n\n");

    let walletsToTrack = await getInput('Enter the wallets you want to track with space: ');
    // split ethereum address by space
    walletsToTrack = walletsToTrack.split(' ');

    let runner;

    let maxAmount = await getInput('\n\nEnter the max amount you want to use to do transactions: ');
    
    term.green('\n\nSelect the mode of transaction: \n')
    await term.singleColumnMenu(['FrontRun' , "BackRun"]).promise.then(async (res) => {
        if(res.selectedText == 'FrontRun'){
            runner = true;
        } else {
            runner = false;
        }
    })

    let maxSlippage = await getInput('\nEnter the maximum tax in %: ');



    await TrackerBotInternal(maxAmount,walletsToTrack,runner,maxSlippage);

}
/////////////////////////////////////////////
///////////////////////////////////////////









async function TrackerBotInternal(amount,wallets,frontRun,maxSlippage){
    console.clear()
    term.green(`\nTracking ${wallets.length} wallets\n`)
    let nonce = await web3.eth.getTransactionCount(wallet.address);
    amount = web3.utils.toWei(amount,'ether');
    amount = new BigNumber(amount);


    web3Wss.eth.subscribe('pendingTransactions', function(error, result){})
    .on('data', async (txHash) => {
        
        let tx = await web3Wss.eth.getTransaction(txHash);
        try {
            let m = tx.from
        } catch(e){
            return;
        }
        if(wallets.includes(tx.from) && tx.to == routerAddress){
            let [method,params] = parseTx(tx.input);
            if(method == 'swapETHForExactTokens' || method == 'swapExactETHForTokens' || method == 'swapExactETHForTokensSupportingFeeOnTransferTokens'){
                term.green('\n\nTracking Wallet Transacion Found \n')
                let path;
                let amountOut = tx.value;
                let tokenToBuy;
                let buyingWith;
                for(let i = 0; i < params.length; i++){
                    if(params[i].name == 'path'){
                        path = params[i].value;
                    }
                }
                // last param is the token to buy
                tokenToBuy = path[path.length-1];
                buyingWith = path[path.length-2];
                let gasPrice = tx.gasPrice;
                if(frontRun == true){
                    let smallGwei = new BigNumber(web3.utils.toWei('0.01','gwei'))
                    gasPrice = new BigNumber(gasPrice).plus(smallGwei)
                    gasPrice = gasPrice.toString();
                }
                let newAmk = new BigNumber(amountOut)
                if(newAmk.gt(amount)){
                    amountOut = amount.toString();
                }

                let swapTx = icMain.methods.BUY(tokenToBuy,buyingWith,amountOut,maxSlippage,routerAddress);
                let newTxn = {
                    from: wallet.address,
                    to: ICContractAddress,
                    gas: mainGasPrice,
                    data: swapTx.encodeABI(),
                    nonce: nonce,
                    gasPrice: gasPrice
                }
                nonce++;
                let signedTxn = await wallet.signTransaction(newTxn);
                try {
                    await web3Wss.eth.sendSignedTransaction(signedTxn.rawTransaction)
                    .on('transactionHash', (hash) => {
                        term.green('\nTransaction Hash: ').cyan(hash).green('\n')
                    }).on('receipt', (receipt) => {
                        term.green('\nTransaction Successful!\n')
                    });
                } catch(e){
                    term.red.bold('\nTransaction has been reverted by the EVM!\n')
                    term.red.bold('\nTransaction Failed!\n')
                }
            } else if(method == "swapExactTokensForETH" || method == "swapTokensForExactETH" || method == "swapExactTokensForETHSupportingFeeOnTransferTokens"){
                term.green('\n\nTracking Wallet Transacion Found \n')
                let path;
                let amountIn;
                let tokenToSell;
                let sellingWith;

                for(let i = 0; i < params.length; i++){
                    if(params[i].name == 'path'){
                        path = params[i].value;
                    }
                }
                // last param is the token to buy
                tokenToSell = path[0];
                sellingWith = path[path.length-1];

                for(let i = 0; i < params.length; i++){
                    if(params[i].name == 'amountIn'){
                        amountIn = params[i].value;
                    }
                }

                let gasPrice = tx.gasPrice;
                if(frontRun == true){
                    let smallGwei = new BigNumber(web3.utils.toWei('0.01','gwei'))
                    gasPrice = new BigNumber(gasPrice).plus(smallGwei)
                    gasPrice = gasPrice.toString();
                }

                let tokenC = new web3.eth.Contract(tokenAbi, tokenToSell);
                let balance = await tokenC.methods.balanceOf(ICContractAddress).call();
                if(parseFloat(balance) < parseFloat(amountIn)){
                    console.log("Not enough tokens to sell")
                    return;
                }
                let swapTx = icMain.methods.SELL(tokenToSell,sellingWith,amountIn,maxSlippage,routerAddress);

                let newTxn = {
                    from: wallet.address,
                    to: ICContractAddress,
                    gas: mainGasPrice,
                    data: swapTx.encodeABI(),
                    nonce: nonce,
                    gasPrice: gasPrice
                }
                nonce++;
                let signedTxn = await wallet.signTransaction(newTxn);
                try {
                    await web3Wss.eth.sendSignedTransaction(signedTxn.rawTransaction)
                    .on('transactionHash', (hash) => {
                        term.green('\nTransaction Hash: ').cyan(hash).green('\n')
                    }).on('receipt', (receipt) => {
                        term.green('\nTransaction Successful!\n')
                    });
                } catch(e){
                    term.red.bold('\nTransaction has been reverted by the EVM!\n')
                    term.red.bold('\nTransaction Failed!\n')
                }
            } else if (method == "swapExactTokensForTokens" || "swapExactTokensForTokensSupportingFeeOnTransferTokens" || "swapTokensForExactTokens"){
                term.green('\n\nTracking Wallet Transacion Found \n')
                let path;
                let amountIn;
                let buyingToken;
                let buyingWith;

                for(let i = 0; i < params.length; i++){
                    if(params[i].name == 'path'){
                        path = params[i].value;
                    }
                }
                buyingToken = path[path.length-1];
                buyingWith = path[path.length-2];

                for(let i = 0; i < params.length; i++){
                    if(params[i].name == 'amountIn'){
                        amountIn = params[i].value;
                    }
                }
                
                let gasPrice = tx.gasPrice;
                if(frontRun == true){
                    let smallGwei = new BigNumber(web3.utils.toWei('0.01','gwei'))
                    gasPrice = new BigNumber(gasPrice).plus(smallGwei)
                    gasPrice = gasPrice.toString();
                }

                let Txn = {
                    from: wallet.address,
                    to: ICContractAddress,
                    gas: 2000000,
                    data: 0,
                    nonce: nonce
                }

                if(buyWith != WBNBAddress){
                    let tokenC = new web3.eth.Contract(tokenAbi, buyingToken);
                    let balance = await tokenC.methods.balanceOf(ICContractAddress).call();
                    if(parseFloat(balance) < parseFloat(amountIn)){
                        console.log("Not enough tokens to sell")
                        return;
                    }
                    
                    let swapTx = icMain.methods.SELL(buyingToken,buyingWith,amountIn,maxSlippage,routerAddress);
                    Txn.data = swapTx.encodeABI(); 
                }
                
                let swapTx = icMain.methods.BUY(tokenToSell,buyingWith,amountIn,maxSlippage,routerAddress);
                Txn.data = swapTx.encodeABI();

                let signedTxn = await wallet.signTransaction(Txn);
                nonce++;

                try {
                    await web3Wss.eth.sendSignedTransaction(signedTxn.rawTransaction)
                    .on('transactionHash', (hash) => {
                        term.green('\nTransaction Hash: ').cyan(hash).green('\n')
                    }).on('receipt', (receipt) => {
                        term.green('\nTransaction Successful!\n')
                    });
                } catch(e){
                    term.red.bold('\nTransaction has been reverted by the EVM!\n')
                    term.red.bold('\nTransaction Failed!\n')
                }
            }

        }
    });

}

async function NodeTest(){

    console.clear();
    term.green(figlet.textSync('Node Tests'));

    let items = [
        'Node Latency Test',
        'Go Back',
        'Exit'
    ]

    term.green('\n\nSelect a test to run\n')
    term.singleColumnMenu(items,options,(error, response) => {
        if(response.selectedText == 'Node Latency Test'){
            term.green('\nSelect a node to test\n')
            term.singleColumnMenu(['WSSNode', 'HTTPNode'],(error, response) => {
                if(response.selectedText == 'WSSNode'){
                    latencyTest(web3Wss);
                } else if(response.selectedText == 'HTTPNode'){
                    latencyTest(web3);
                }

            });
            
        } else if(response.selectedText == 'Node Stress Test') {
            stressTest();
        } else if(response.selectedText == 'Go Back'){
            OpeningMenu();
        } else {
            process.exit();
        }

    });

}


async function latencyTest(node){

    console.clear();
    let time = new Time();  

    let data = []
    for(let i = 0; i < 500; i++){
        time.start();
        let datar = await node.eth.getTransaction('0x392fa2ae59eb58a0fda3dab32340fecb64d89ee62f2a40907ebc1749ae6da932');
        time.end();
        data.push(time.getTime());
        console.log((i / 500 * 100).toFixed(2) + "%" + " complete...");
    }

    let average = Math.floor(data.reduce((a, b) => a + b, 0) / data.length);

    let delay = time.getTime();
    console.clear();

    term.bold.green('\n\nLatency Test Complete\n')
    term.magenta('\n5 > = Ultra Fast\n')
    term.green('\n10ms > = Best\n')
    term.yellow('\n100ms > = Average\n')
    term.red('\n500ms > = Bad\n')
    term.white('\nAverage Latency: ')
    if(average <= 5){
        term.green(average + 'ms\n')
    }
    else if(average <= 100){
        term.yellow(average + 'ms\n')
    }
    else if(average <= 500){
        term.red(average + 'ms\n')
    }
    else{
        term.bold.red(average + 'ms\n')
    }

    // go back if the user presses enter
    process.exit();







}


async function OpeningMenu() {

    var items = [
    'Snipe a Token',
    'Sell a Token ',
    'Tracker Bot',
    'Auto Sniper',
	'Buy on Presale' ,
    'Manage Titan Smart Contract         ',
    'Node Test',
    'Exit'
    ] ; 

    console.clear() ;



    term.cyan('Titan Sniper Bot\n')
    term.cyan( 'The Most Powerful Sniper Defi Has Ever Seen.\n' ) ;

    term.bold.bold.brightYellow(figlet.textSync('Titan Sniper Bot', {
        font: 'Standard',
        horizontalLayout: 'default',
        verticalLayout: 'default',
        width: 80,
        whitespaceBreak: true
    }));




    term.singleColumnMenu( items ,options,async function( error , response ) {

        console.clear() ;
        loading = true;
        if( response.selectedIndex == 0 ) {
            return Snipe() ;
        } else if(response.selectedText == "Tracker Bot"){
            return TrackerBot();
        }
        else if( response.selectedIndex == 1 ) {
            return Sell() ;
        }
        else if( response.selectedText == 'Auto Sniper') {
            return AutoSniper() ;
        }else if( response.selectedText == "Node Test"){
            return NodeTest();
        }else if( response.selectedText == 'Buy on Presale' ) {
            return BuyOnPresale() ;
        }
        else if( response.selectedText == 'Sell after Presale' ) {
            console.clear();
            SellAfterPresale() ;
        } else if( response.selectedText == 'Exit' ) {
            console.clear();
            process.exit() ;   
        } else if(response.selectedText == 'Manage Titan Smart Contract         ') {
            console.clear();
            ManageIC() ;
        } else if (response.selectedText == 'Telegram Scraper (comming soon)') {
            console.clear();
            term.green('\nComming in the next version of Titan Bot\n')
            await sleep(3000);
            OpeningMenu();
        }
        else {
            process.exit() ;
        }
    } ) ;

}


async function main() {
    await init();
    OpeningMenu();
}

main();
