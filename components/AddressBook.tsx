import * as React from "react";
import {
  Table,
  TableCaption,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  Tooltip,
  useToast,
  Tfoot,
} from "@chakra-ui/react";
import { CopyIcon } from "@chakra-ui/icons";
import { NCell, NScript } from "../common/types";
import { BI } from "@ckb-lumos/lumos";
import { formatDisplayAddress, formatDisplayCapacity } from "../common/utils";
import { CopyToClipboard } from "react-copy-to-clipboard";
import { Pagination } from "./Pagination";
import { DEFAULT_PAGE_SIZE } from "../common/const";

type AddressBookProp = {
  offChainLockInfos: NScript[];
  onChainLockInfos: NScript[];
  cells: NCell[];
};
type TableItemProp = {
  address: string;
  balance: string;
};
export function AddressBook(prop: AddressBookProp) {
  const [pageIndex, setPageIndex] = React.useState(0);
  const { offChainLockInfos, onChainLockInfos, cells } = prop;
  const tableItems = [...offChainLockInfos, ...onChainLockInfos].map(
    (lockInfo: NScript): TableItemProp => {
      const address = lockInfo.address;
      const addressCells = cells.filter((cell) => cell.address === address);
      const addressBalance = addressCells.reduce((acc, cell) => {
        return acc.add(cell.cellOutput.capacity);
      }, BI.from(0));
      return {
        address,
        balance: formatDisplayCapacity(addressBalance),
      };
    }
  );
  const toast = useToast();
  function handleAddressClick(address: string): void {
    toast({
      title: "Copied.",
      status: "success",
      duration: 1000,
    });
  }
  const currentPageItems = tableItems.slice(
    pageIndex * 10,
    (pageIndex + 1) * 10
  );

  return (
    <TableContainer>
      <Table variant="striped" colorScheme="teal">
        <Thead>
          <Tr>
            <Th>Address</Th>
            <Th>Balance</Th>
          </Tr>
        </Thead>
        <Tbody>
          {currentPageItems.map((item) => (
            <Tr key={item.address}>
              <Td>
                <Tooltip label={item.address}>
                  {formatDisplayAddress(item.address)}
                </Tooltip>
                <CopyToClipboard
                  text={item.address}
                  onCopy={() => handleAddressClick(item.address)}
                >
                  <CopyIcon cursor="pointer" marginLeft={2} />
                </CopyToClipboard>
              </Td>
              <Td>{item.balance} CKB</Td>
            </Tr>
          ))}
          {currentPageItems.length <= DEFAULT_PAGE_SIZE &&
            new Array(DEFAULT_PAGE_SIZE - currentPageItems.length)
              .fill(null)
              .map((_, index) => (
                <Tr key={index}>
                  <Td>{"-"}</Td>
                  <Td></Td>
                </Tr>
              ))}
        </Tbody>
        <Tfoot>
          <Tr>
            <Pagination
              pageIndex={pageIndex}
              setPageIndex={setPageIndex}
              totalCount={tableItems.length}
            />
          </Tr>
        </Tfoot>
      </Table>
    </TableContainer>
  );
}