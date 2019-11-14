/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 * @flow
 */

import React, {Component} from 'react';
import { Platform, StyleSheet, Text, View, TextInput, Button, Alert, Image } from 'react-native';
import StellarSdk from '@pigzbe/react-native-stellar-sdk';
import QRCode from "react-native-qrcode";

// var StellarSdk;

const instructions = Platform.select({
  ios: 'Press Cmd+R to reload,\n' + 'Cmd+D or shake for dev menu',
  android:
    'Double tap R on your keyboard to reload,\n' +
    'Shake or press menu button for dev menu',
});

type Props = {};
export default class App extends Component<Props> {

  TOKEN_CODE = "RHT";
  TOKEN_ISSUER = "GCLNYYCC226567NWO7RYVB3DKJ5E7QEBY7R5RC3EYXWQBIRWM7ISWF24";
  TOKEN_LIMIT = "45000000";

  state = {
    address: "",
    xlmBalance: "0",
    tokenBalance: "0",
    recipient: "GAS44DBJ5JAG4RNHWBAST5J7D6KEPLCBHKVEICPA7Y7BN7NMHHA7YUG3",
    sendAmount: "",
    sendMemo: "",
  }

  server;
  keyPair;
  timer;

  constructor(props) {
    super(props)

    StellarSdk.Network.usePublicNetwork();
    this.server = new StellarSdk.Server("https://horizon.stellar.org");
    this.initWallet();
  }

  componentDidMount() {
    this.timer = setInterval(this.tick.bind(this), 5000);
  }

  componentWillUnmount() {
    this.clearInterval(this.timer);
  }

  tick =() => {
    this.refreshBalance();
  }

  saveSeed(seed) {
    // You have to save the seed to secure storage.
  }

  loadSeed() {
    // Please replace seed with code which load from secure storage.
    var seed = "SAUR3QQWFUAYGCECQEXQVK36T6AAD6HJ3BJBSTV2W2QAS2E23HICPLQU";

    return seed;
  }

  async initWallet() {
    let seed = this.loadSeed();
    let publicKey;

    if (!seed) {
      // create a new pair
      this.keyPair = await StellarSdk.Keypair.randomAsync();
      seed = this.keyPair.secret();
      publicKey = this.keyPair.publicKey();
      this.saveSeed(seed);
    } else {
      this.keyPair = await StellarSdk.Keypair.fromSecret(seed);
      publicKey = this.keyPair.publicKey();
    }
    
    this.setState({
      address: publicKey
    });
    console.log("address=", this.state.address);
    
    await this.addNewAsset(this.TOKEN_CODE, this.TOKEN_ISSUER, this.TOKEN_LIMIT, this.state.address);
  }

  async addNewAsset(assetCode, issuingAccount, limit, address) {
    const account = await this.loadAccount(address);
    if (!account)
      return;

    var trusted = account.balances.some(function(balance) {
      return (balance.asset_code == assetCode 
          && balance.asset_issuer == issuingAccount);
    });
    if (trusted)
      return;

    var asset = new StellarSdk.Asset(assetCode, issuingAccount);
    const fee = await this.server.fetchBaseFee();
    
    let transaction;
    try {
      transaction  = new StellarSdk.TransactionBuilder(account, {fee: fee})
        .addOperation(StellarSdk.Operation.changeTrust({
          asset: asset,
          limit: limit 
        }))
        .setTimeout(30)
        .build();
    } catch(e) {
      console.log("Failed to build transaction: ", e);
      return;
    }

    await transaction.sign(this.keyPair);

    try {
      await this.server.submitTransaction(transaction);
      this.refreshBalance();
    } catch (e) {
      console.log(e);
    }
  }

  async refreshBalance() {
    if (!this.state.address) {
      return
    }

    const account = await this.loadAccount(this.state.address);
    if (!account)
      return;

    var tokenAdded = false;

    for (let i in account.balances) {
      let item = account.balances[i];
      if (item.asset_type == 'native') {
        let balance = item.balance;
        let number = parseFloat(balance);
        this.setState({
          xlmBalance: number.toString()
        });
      }
      else if (item.asset_code == this.TOKEN_CODE && 
            item.asset_issuer == this.TOKEN_ISSUER ) {
        let balance = item.balance;
        let number = parseFloat(balance);
        this.setState({
          tokenBalance: number.toString()
        });
        tokenAdded = true;
      } else {
        console.log("Unknow Type:", item.asset_type, ", Balance:", item.balance);
      }
    }

    if (!tokenAdded) {
      this.addNewAsset(this.TOKEN_CODE, this.TOKEN_ISSUER, this.TOKEN_LIMIT, this.state.address);
    }
  }

  async loadAccount(address) {
    let account;
    try {
      // If balance is not enough, it will be failed to load account. It needs 1 XLM at least
      account = await this.server.loadAccount(address);
    }
    catch(e) {
      console.log("Failed to load account: ", e);
      return null;
    }
    return account;
  }

  async send() {
    console.log("recipient: ", this.state.recipient);
    console.log("sendAmount: ", this.state.sendAmount);
    console.log("sendMemo: ", this.state.sendMemo);

    if (this.state.tokenBalance < this.state.sendAmount) {
      Alert.alert("Insufficient balance");
      return
    }

    const account = await this.loadAccount(this.state.address);
    if (!account) {
      Alert.alert("Failed to send", "Your account is invalid");
      return;
    }

    const asset = new StellarSdk.Asset(this.TOKEN_CODE, this.TOKEN_ISSUER);
    const fee = await this.server.fetchBaseFee();

    let transaction;
    try {
      transaction  = new StellarSdk.TransactionBuilder(account, {fee: fee})
        .addOperation(StellarSdk.Operation.payment({
          asset: asset,
          destination: this.state.recipient,
          amount: this.state.sendAmount
        }))
        .addMemo(StellarSdk.Memo.text(this.state.sendMemo))
        .setTimeout(30)
        .build();
    } catch(e) {
      console.log("Failed to build transaction: ", e);
      Alert.alert("Failed to send", "Build transaction failed");
      return;
    }

    transaction.sign(this.keyPair);

    try {
      await this.server.submitTransaction(transaction);
      this.refreshBalance();
    } catch (e) {
      console.log('An error has occured:', e);
      Alert.alert("Failed to send", "Submit transaction failed");
    }

    Alert.alert("Sent", this.state.sendAmount + "RHT to " + this.state.address);
  }

  render() {

    return (
      <View style={styles.container}>
        <Text style={styles.title}>Address and Balance</Text>
        <Text style={styles.instructions}> Address: {this.state.address}  </Text>
        <QRCode
          value={this.state.address}
          //Setting the value of QRCode
          size={160}
          //Size of QRCode
          bgColor="#000"
          //Backgroun Color of QRCode
          fgColor="#fff"
          //Front Color of QRCode
        />
        <Text style={styles.instructions}> {this.state.xlmBalance} XLM </Text>
        <Text style={styles.instructions}> {this.state.tokenBalance} RHT </Text>

        <Text style={styles.title}>Send RHT Token</Text>
        <TextInput
          style={styles.instructions}
          value={this.state.recipient}
          placeholder="Type here recipient address"
          onChangeText={(recipient) => this.setState({recipient})}
        />
        <TextInput
          style={styles.instructions}
          value={this.state.sendAmount}
          placeholder="Type here token amount to send"
          onChangeText={(sendAmount) => this.setState({sendAmount})}
        />
        <TextInput
          style={styles.instructions}
          value={this.state.sendMemo}
          placeholder="Type here memo to send"
          onChangeText={(sendMemo) => this.setState({sendMemo})}
        />
        <Button
          onPress={this.send.bind(this)}
          title="Send"
          color="#841584"
          accessibilityLabel="Send token"
        />

      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5FCFF',
  },
  title: {
    fontSize: 20,
    textAlign: 'center',
    margin: 4,
  },
  instructions: {
    textAlign: 'center',
    color: '#333333',
    margin: 4,
  },
});
