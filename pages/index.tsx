import * as React from "react";
import {
  Badge,
  ChakraProvider,
  FormControl,
  FormLabel,
  Input,
  NumberInput,
  NumberInputField,
} from "@chakra-ui/react";
import Head from "next/head";
import { useEffect, useState } from "react";
import {
  Container,
  Button,
  Box,
  Text,
  useToast,
  Link,
} from "@chakra-ui/react";
import { CheckCircleIcon } from "@chakra-ui/icons";
import styles from "../styles/Home.module.css";
import { CellCard } from "../components/CellCard";
import {
  BI,
  Cell,
  config,
  helpers,
  Indexer,
  RPC,
  Script,
  WitnessArgs,
} from "@ckb-lumos/lumos";
import { bytes } from "@ckb-lumos/codec";
import { blockchain } from "@ckb-lumos/base";
import { DownloadInfoButton } from "../components/DownloadInfoButton";
import { NModal } from "../components/NModal";
import { AddressBook } from "../components/AddressBook";
import { NCell, NScript } from "../common/types";
import { getOffChainLocks, getOnChainLocks } from "../common/nexusTools";

export default function Home() {
  const [ckb, setCkb] = useState<any>();
  const [balance, setBalance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [transfering, setTransfering] = useState(false);
  const [fullCells, setFullCells] = useState<Array<NCell>>([]);
  const [transferToAddress, setTransferToAddress] = useState("");
  const [transferToLock, setTransferToLock] = useState<Script>();
  const [tansferAmount, setTansferAmount] = useState<number>();
  const [receiveAddress, setReceiveAddress] = useState(
    'click "create" to generate a new receive address'
  );
  const [offChainLockInfos, setOffChainLockInfos] = useState<Array<NScript>>([]);
  const [onChainLockInfos, setOnChainLockInfos] = useState<Array<NScript>>([]);
  const toast = useToast();
  useEffect(() => {
    handleConnect();
  }, []);
  useEffect(() => {
    handleRefresh();
    handleCreateReceiveAddress();
  }, [ckb]);

  // TODO make config configurable
  config.initializeConfig(config.predefined.AGGRON4);
  async function getConfig(): Promise<config.Config> {
    // TODO return ckb.configService.getConfig();
    return Promise.resolve(config.getConfig());
  }
  async function handleRefresh(): Promise<Cell[]> {
    if (!ckb) {
      return;
    }
    setRefreshing(true);
    try {
      let res = 0;
      let fullCells: Array<NCell> = [];
      let liveCellsResult = await ckb.fullOwnership.getLiveCells({});
      fullCells.push(...liveCellsResult.objects);
      while (liveCellsResult.objects.length === 20) {
        // loop if current page has 20 cells(maximum number of cells per page)
        liveCellsResult = await ckb.fullOwnership.getLiveCells({
          cursor: liveCellsResult.cursor,
        });
        fullCells.push(...liveCellsResult.objects);
      }
      fullCells.forEach((cell) => {
        res += Number(cell.cellOutput.capacity);
      });
      const networkConfig = await getConfig();
      fullCells = fullCells.map((cell): NCell => {
        return {
          ...cell,
          address: helpers.encodeToAddress(cell.cellOutput.lock, {
            config: networkConfig,
          }),
        };
      });
      const offChainLocks: Script[] = await getOffChainLocks(ckb);
      const onChainExternalLocks: Script[] = await getOnChainLocks(ckb, 'external');
      const onChainInternalLocks: Script[] = await getOnChainLocks(ckb, 'internal');
      
      setOffChainLockInfos(
        offChainLocks.map(
          (lock): NScript => ({
            lock,
            address: helpers.encodeToAddress(lock, { config: networkConfig }),
          })
        )
      );
      setOnChainLockInfos(
        [...onChainExternalLocks, ...onChainInternalLocks].map(
          (lock): NScript => ({
            lock,
            address: helpers.encodeToAddress(lock, { config: networkConfig }),
          })
        )
      );
      setFullCells(fullCells);
      setBalance(res);
      setRefreshing(false);
      return fullCells;
    } catch (error) {
      setRefreshing(false);
      console.log("handleRefreshBalance error", error);
    }
  }

  async function handleReceiverChange(e) {
    const receiverAddress = e.target.value;
    setTransferToAddress(receiverAddress);
    try {
      const receiverLock = helpers.parseAddress(receiverAddress);
      setTransferToLock(receiverLock);
    } catch (error) {
      console.log("handleReceiverChange error", error);
    }
  }

  async function handleTransfer() {
    if (!ckb || isNaN(Number(tansferAmount)) || tansferAmount < 64) {
      return;
    }
    setTransfering(true);
    try {
      const newFullCells = await handleRefresh();
      const changeLock: Script = (
        await ckb.fullOwnership.getOffChainLocks({ change: "internal" })
      )[0];
      console.log("changeLock", changeLock);
      console.log("target address", transferToAddress);
      console.log("target lock", transferToLock);
      console.log("transfer amount", tansferAmount);
      const preparedCells = [];
      const transferAmountBI = BI.from(tansferAmount).mul(10 ** 8);
      let prepareAmount = BI.from(0);
      for (let i = 0; i < newFullCells.length; i++) {
        const cellCkbAmount = BI.from(newFullCells[i].cellOutput.capacity);
        preparedCells.push(newFullCells[i]);
        prepareAmount = prepareAmount.add(cellCkbAmount);
        if (
          prepareAmount
            .sub(1000)
            .sub(64 * 10 ** 8)
            .gte(transferAmountBI)
        ) {
          break;
        }
      }
      const indexer = new Indexer("https://testnet.ckb.dev");
      let txSkeleton = helpers.TransactionSkeleton({ cellProvider: indexer });
      txSkeleton = txSkeleton.update("inputs", (inputs) => {
        return inputs.concat(...preparedCells);
      });

      const outputCells: Cell[] = [];
      outputCells[0] = {
        cellOutput: {
          capacity: transferAmountBI.toHexString(),
          lock: transferToLock,
        },
        data: "0x",
      };
      outputCells[1] = {
        cellOutput: {
          // change amount = prepareAmount - transferAmount - 1000 shannons for tx fee
          capacity: prepareAmount.sub(transferAmountBI).sub(1000).toHexString(),
          lock: changeLock,
        },
        data: "0x",
      };
      txSkeleton = txSkeleton.update("outputs", (outputs) => {
        return outputs.concat(...outputCells);
      });

      txSkeleton = txSkeleton.update("cellDeps", (cellDeps) => {
        return cellDeps.concat({
          outPoint: {
            txHash:
              config.predefined.AGGRON4.SCRIPTS.SECP256K1_BLAKE160.TX_HASH,
            index: config.predefined.AGGRON4.SCRIPTS.SECP256K1_BLAKE160.INDEX,
          },
          depType:
            config.predefined.AGGRON4.SCRIPTS.SECP256K1_BLAKE160.DEP_TYPE,
        });
      });
      for (let i = 0; i < preparedCells.length; i++) {
        txSkeleton = txSkeleton.update("witnesses", (witnesses) =>
          witnesses.push("0x")
        );
      }
      const witnessArgs: WitnessArgs = {
        lock: bytes.hexify(new Uint8Array(65)),
      };
      const secp256k1Witness = bytes.hexify(
        blockchain.WitnessArgs.pack(witnessArgs)
      );
      for (let i = 0; i < preparedCells.length; i++) {
        txSkeleton = txSkeleton.update("witnesses", (witnesses) =>
          witnesses.set(i, secp256k1Witness)
        );
      }
      console.log(
        "txSkeleton",
        helpers.transactionSkeletonToObject(txSkeleton)
      );

      const tx = helpers.createTransactionFromSkeleton(txSkeleton);
      console.log("tx to sign:", tx);

      const signatures: any[] = await ckb.fullOwnership.signTransaction({ tx });
      console.log("signatures", signatures);
      for (let index = 0; index < signatures.length; index++) {
        const [lock, sig] = signatures[index];
        const newWitnessArgs: WitnessArgs = {
          lock: sig,
        };
        const newWitness = bytes.hexify(
          blockchain.WitnessArgs.pack(newWitnessArgs)
        );
        tx.witnesses[index] = newWitness;
      }
      console.log("tx to send on chain", tx);
      const rpc = new RPC("https://testnet.ckb.dev");
      const txHash = await rpc.sendTransaction(tx);
      console.log("txHash", txHash);
      toast({
        title: "Transaction has been sent.",
        description: (
          <Text>
            Visit{" "}
            <Link
              href={`https://pudge.explorer.nervos.org/transaction/${txHash}`}
            >
              <Text fontStyle="initial" fontWeight={500}>
                explorer
              </Text>
            </Link>{" "}
            to check tx status.
          </Text>
        ),
        status: "success",
        duration: 60_000,
        isClosable: true,
      });
    } catch (error) {
      console.log("handleTransfer error", error);
      toast({
        title: "Error",
        description: error.message,
        status: "error",
        duration: 60_000,
        isClosable: true,
      });
    }
    setTransfering(false);
  }
  async function handleConnect() {
    const windowCKB = (window as any).ckb;
    if (!windowCKB) {
      console.log("no nexus wallet found!");
      return;
    }
    const ckb = await windowCKB.enable();
    setCkb(ckb);
  }
  async function handleCreateReceiveAddress() {
    if (!ckb) {
      return;
    }
    const nextLocks = await ckb.fullOwnership.getOffChainLocks({});
    if (!nextLocks.length) {
      console.error("No lock found");
      return;
    }
    const nextLock = nextLocks[Math.floor(Math.random() * nextLocks.length)];
    console.log("next lock", nextLock);
    const nextAddress = helpers.encodeToAddress(nextLock, {
      config: config.predefined.AGGRON4,
    });
    console.log("next address", nextAddress);
    setReceiveAddress(nextAddress);
  }
  function parse(valueString: string): React.SetStateAction<number> {
    return Number(valueString);
  }

  return (
    <ChakraProvider>
      <Container>
        <div className={styles.container}>
          <Head>
            <title>Demo Nexus</title>
            <link rel="icon" href="/favicon.ico" />
          </Head>

          <Text fontSize="4xl">
            Full Ownership Demo <DownloadInfoButton />
          </Text>
          <div className={styles.connect}>
            {!!ckb ? (
              <Badge fontSize="xl" fontStyle="italic">
                Connected {"  "}
                <CheckCircleIcon color="green.500" />
              </Badge>
            ) : (
              <Badge>
                {" "}
                <Button onClick={handleConnect} colorScheme="teal">
                  Connect Wallet
                </Button>
              </Badge>
            )}
          </div>
          <Text fontSize="xl" fontWeight={500} marginBottom="1rem">
            BALANCE: {(Math.floor(balance / 10 ** 6) / 100).toFixed(2)} CKB
            <Button
              onClick={handleRefresh}
              isLoading={refreshing}
              marginLeft={4}
            >
              Refresh
            </Button>
          </Text>

          <NModal title="Address Book">
            <AddressBook
              offChainLockInfos={offChainLockInfos}
              onChainLockInfos={onChainLockInfos}
              cells={fullCells}
            />
          </NModal>
      

          <Box maxHeight="24rem" overflowY="auto" marginBottom={4}>
            {fullCells.length === 0 && <Text>No live cells found yet.</Text>}
            {fullCells.map((cell, i) => {
              return <CellCard {...cell} key={i} />;
            })}
          </Box>

          <FormControl>
            <FormLabel>Transfer To:</FormLabel>
            <Input
              type="text"
              value={transferToAddress}
              onChange={handleReceiverChange}
            />
            <FormLabel marginTop={2}>Transfer Amount:</FormLabel>
            <NumberInput
              onChange={(valueString) => setTansferAmount(parse(valueString))}
              value={tansferAmount}
            >
              <NumberInputField />
            </NumberInput>
            <Button
              marginTop={4}
              onClick={handleTransfer}
              isLoading={transfering}
            >
              Transfer
            </Button>
          </FormControl>

          <Box
            width="100%"
            border="1px"
            borderColor="gray.200"
            borderRadius={4}
            marginTop={4}
            padding={4}
            textAlign="center"
            lineHeight="40px"
          >
            <Text fontSize="2xl" fontWeight={500}>
              {" "}
              RECEIVE{" "}
            </Text>
            <Button onClick={handleCreateReceiveAddress}>Create</Button>
            <Text>{receiveAddress}</Text>
          </Box>
          <style jsx global>{`
            html,
            body {
              padding: 0;
              margin: 0;
              font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto,
                Oxygen, Ubuntu, Cantarell, Fira Sans, Droid Sans, Helvetica Neue,
                sans-serif;
            }
            * {
              box-sizing: border-box;
            }
          `}</style>
        </div>
      </Container>
    </ChakraProvider>
  );
}
