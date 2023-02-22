import { Box, Badge } from '@chakra-ui/react'
import { BI, Cell } from '@ckb-lumos/lumos'

type Props = Cell & {
  hilight?: boolean
}
export function CellCard(prop: Props) {
  const property = {
    capacity: prop.cellOutput.capacity,
    args: prop.cellOutput.lock.args,
  }

  return (
    <Box maxW='sm' borderWidth='1px' borderRadius='lg' overflow='hidden'>
      <Box p='6'>
        <Box display='flex' alignItems='baseline'>
          <Badge borderRadius='full' px='2' colorScheme='teal'>
            Full Ownership
          </Badge>
        </Box>

        <Box
          mt='1'
          fontWeight='semibold'
          as='h4'
          lineHeight='tight'
          noOfLines={1}
        >
          {(BI.from(property.capacity).div(10 ** 6).toNumber()/100).toFixed(2)}
        </Box>

          <Box
          mt='1'
            color='gray.500'
            fontWeight='semibold'
            letterSpacing='wide'
            fontSize='xs'
          >
            ARGS:{property.args}
          </Box>
      </Box>
    </Box>
  )
}