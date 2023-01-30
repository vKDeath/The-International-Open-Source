// eslint-disable
import Impl from './utf15'
const coordDepths = [6, 6] // max = [64,64]
const coord_Codec = new Impl.Codec({ array: 1, depth: coordDepths })

const posDepths = [2, 7, 7, 6, 6] // max = [4,128,128,64,64]
const pos_Codec = new Impl.Codec({ array: 1, depth: posDepths })
/**
 * screeps-packrat
 * ---------------
 * Lightning-fast and memory-efficient serialization of Screeps IDs, Coords, and RoomPositions
 * Code written by Muon as part of Overmind Screeps AI
 * Modified by Carson Burke and Pieter Brandsen
 *
 * Feel free to adapt as desired
 * Package repository: https://github.com/bencbartlett/screeps-packrat
 *
 * To use: import desired functions from module
 * To benchmark: import tests file, PackratTests.run()
 *
 * +--------------------------+------------------------------------------------+-----------------+--------------------+
 * |         function         |                  description                   | execution time* | memory reduction** |
 * +--------------------------+------------------------------------------------+-----------------+--------------------+
 * | packId                   | packs a game object id into 6 chars            | 500ns           | -75%               |
 * | unpackId                 | unpacks 6 chars into original format           | 1.3us           |                    |
 * | packIdList               | packs a list of ids into a single string       | 500ns/id        | -81%               |
 * | unpackIdList             | unpacks a string into a list of ids            | 1.2us/id        |                    |
 * | packPos                  | packs a room position into 2 chars             | 150ns           | -90%               |
 * | unpackPos                | unpacks 2 chars into a room position           | 600ns           |                    |
 * | packPosList              | packs a list of room positions into a string   | 150ns/pos       | -95%               |
 * | unpackPosList            | unpacks a string into a list of room positions | 1.5us/pos       |                    |
 * | packCoord                | packs a coord (e.g. {x:25,y:25}) as a string   | 150ns           | -80%               |
 * | unpackCoord              | unpacks a string into a coord                  | 60-150ns        |                    |
 * | packCoordList            | packs a list of coords as a string             | 120ns/coord     | -94%               |
 * | unpackCoordList          | unpacks a string into a list of coords         | 100ns/coord     |                    |
 * | unpackCoordAsPos         | unpacks string + room name into a pos          | 500ns           |                    |
 * | unpackCoordListAsPosList | unpacks string + room name into a list of pos  | 500ns/coord     |                    |
 * +--------------------------+------------------------------------------------+-----------------+--------------------+
 *
 *  * Execution time measured on shard2 public servers and may vary on different machines or shards.
 * ** Memory reduction for list functions is the asymptotic limit of lists containing many entries. Lower reductions
 *    can be expected for smaller lists.
 *
 */

/**
 * The following lines would be better placed in your declarations files
 */

/**
 * Convert a hex string to a Uint16Array.
 */
function hexToUint16Array(hex: string) {
    const len = Math.ceil(hex.length / 4) // four hex chars for each 16-bit value
    const array = new Uint16Array(len)
    for (let i = 0; i < hex.length; i += 4) {
        array[i >>> 2] = parseInt(hex.substr(i, 4), 16)
    }
    return array
}

/**
 * Convert a Uint16Array to a hex string. Note that uint16ArrayToHex(hexToUint16Array('0123abce')) will
 * return '123abcde' since this does not account for zero padding. Fortunately this is not an issue for screeps, since
 * ids do not seem to be allowed to start with a 0.
 */
function uint16ArrayToHex(array: Uint16Array) {
    const hex: string[] = []
    let current: number
    for (let i = 0; i < array.length; ++i) {
        current = array[i]
        hex.push((current >>> 8).toString(16))
        hex.push((current & 0xff).toString(16))
    }
    return hex.join('')
}

/**
 * Convert a standard 24-character hex id in screeps to a compressed UTF-16 encoded string of length 6.
 *
 * Benchmarking: average of 500ns to execute on shard2 public server, reduce stringified size by 75%
 */
export function packId(id: string) {
    return (
        String.fromCharCode(parseInt(id.substr(0, 4), 16)) +
        String.fromCharCode(parseInt(id.substr(4, 4), 16)) +
        String.fromCharCode(parseInt(id.substr(8, 4), 16)) +
        String.fromCharCode(parseInt(id.substr(12, 4), 16)) +
        String.fromCharCode(parseInt(id.substr(16, 4), 16)) +
        String.fromCharCode(parseInt(id.substr(20, 4), 16))
    )
}

/**
 * Convert a compressed six-character UTF-encoded id back into the original 24-character format.
 *
 * Benchmarking: average of 1.3us to execute on shard2 public server
 */
export function unpackId(packedId: string) {
    let id = ''
    let current: number
    for (let i = 0; i < 6; ++i) {
        current = packedId.charCodeAt(i)
        id += (current >>> 8).toString(16).padStart(2, '0') // String.padStart() requires es2017+ target
        id += (current & 0xff).toString(16).padStart(2, '0')
    }
    return id
}

/**
 * Packs a list of ids as a utf-16 string. This is better than having a list of packed coords, as it avoids
 * extra commas and "" when memory gets stringified.
 *
 * Benchmarking: average of 500ns per id to execute on shard2 public server, reduce stringified size by 81%
 */
export function packIdList(ids: string[]) {
    let str = ''
    for (let i = 0; i < ids.length; ++i) {
        str += packId(ids[i])
    }
    return str
}

/**
 * Unpacks a list of ids stored as a utf-16 string.
 *
 * Benchmarking: average of 1.2us per id to execute on shard2 public server.
 */
export function unpackIdList(packedIds: string) {
    const ids: string[] = []
    for (let i = 0; i < packedIds.length; i += 6) {
        ids.push(unpackId(packedIds.substr(i, 6)))
    }
    return ids
}

/**
 * Packs a coord as a single utf-16 character. The seemingly strange choice of encoding value ((x << 6) | y) + 65 was
 * chosen to be fast to compute (x << 6 | y is significantly faster than 50 * x + y) and to avoid control characters,
 * as "A" starts at character code 65.
 *
 * Benchmarking: average of 150ns to execute on shard2 public server, reduce stringified size by 80%
 */
export function packCoord(coord: Coord) {
    return coord_Codec.encode([coord.x, coord.y])
    // return String.fromCharCode(((coord.x << 6) | coord.y) + 65)
}

/**
 * Packs a coord as a single utf-16 character. The seemingly strange choice of encoding value ((x << 6) | y) + 65 was
 * chosen to be fast to compute (x << 6 | y is significantly faster than 50 * x + y) and to avoid control characters,
 * as "A" starts at character code 65.
 *
 * Benchmarking: average of 150ns to execute on shard2 public server, reduce stringified size by 80%
 */
export function packXYAsCoord(x: number, y: number) {
    return coord_Codec.encode([x, y])
    // return String.fromCharCode(((x << 6) | y) + 65)
}

/**
 * Unpacks a coord stored as a single utf-16 character
 *
 * Benchmarking: average of 60ns-100ns to execute on shard2 public server
 */
export function unpackCoord(char: string) {
    const decoded = coord_Codec.decode(char) as number[]
    return { x: decoded[0], y: decoded[1] }
    //     const xShiftedSixOrY = char.charCodeAt(0) - 65
    //     return {
    //         x: (xShiftedSixOrY & 0b111111000000) >>> 6,
    //         y: xShiftedSixOrY & 0b000000111111,
    //     }
}

/**
 * Unpacks a coordinate and creates a RoomPosition object from a specified roomName
 *
 * Benchmarking: average of 500ns to execute on shard2 public server
 */
export function unpackCoordAsPos(packedCoord: string, roomName: string) {
    const coord = unpackCoord(packedCoord)
    return new RoomPosition(coord.x, coord.y, roomName)
}

export function reverseCoordList(coordList: string) {
    return coordList
        .match(/.{1,2}/g)
        .reverse()
        .join('')
}

/**
 * Packs a list of coords as a utf-16 string. This is better than having a list of packed coords, as it avoids
 * extra commas and "" when memory gets stringified.
 *
 * Benchmarking: average of 120ns per coord to execute on shard2 public server, reduce stringified size by 94%
 */
export function packCoordList(coords: Coord[]) {
    let str = ''
    const maxLength = coords.length
    for (let i = 0; i < maxLength; i++) {
        str += packCoord(coords[i])
        //    str += String.fromCharCode(((coords[i].x << 6) | coords[i].y) + 65)
    }
    return str
}

/**
 * Unpacks a list of coords stored as a utf-16 string
 *
 * Benchmarking: average of 100ns per coord to execute on shard2 public server
 */
export function unpackCoordList(chars: string) {
    const coords: Coord[] = []
    for (let i = 0; i < chars.length; i += 2) {
        coords.push(unpackCoord(chars[i] + chars[i + 1]))
    }
    //     let xShiftedSixOrY: number
    //     for (let i = 0; i < chars.length; ++i) {
    //         xShiftedSixOrY = chars.charCodeAt(i) - 65
    //         coords.push({
    //             x: (xShiftedSixOrY & 0b111111000000) >>> 6,
    //             y: xShiftedSixOrY & 0b000000111111,
    //         })
    //     }
    return coords
}

/**
 * Unpacks a list of coordinates and creates a list of RoomPositions from a specified roomName
 *
 * Benchmarking: average of 500ns per coord to execute on shard2 public server
 */
export function unpackCoordListAsPosList(packedCoords: string, roomName: string) {
    const positions: RoomPosition[] = []
    let coord: Coord
    // for (let i = 0; i < packedCoords.length; ++i) {
    for (let i = 0; i < packedCoords.length; i += 2) {
        // Each coord is saved as a single character; unpack each and insert the room name to get the positions list
        // coord = unpackCoord(packedCoords[i])
        coord = unpackCoord(packedCoords[i] + packedCoords[i + 1])
        positions.push(new RoomPosition(coord.x, coord.y, roomName))
    }
    return positions
}

// global.packedRoomNames = global.packedRoomNames || {}
// global.unpackedRoomNames = global.unpackedRoomNames || {}

/**
 * Packs a roomName as a single utf-16 character. Character values are stored on permacache.
 */
function packRoomName(roomName: string) {
    //     if (global.packedRoomNames[roomName] === undefined) {
    const coordinateRegex = /(E|W)(\d+)(N|S)(\d+)/g
    const match = coordinateRegex.exec(roomName)!

    const xDir = match[1]
    const x = Number(match[2])
    const yDir = match[3]
    const y = Number(match[4])

    let quadrant
    if (xDir === 'W') {
        if (yDir === 'N') {
            quadrant = 0
        } else {
            quadrant = 1
        }
    } else if (yDir === 'N') {
        quadrant = 2
    } else {
        quadrant = 3
    }

    return { quadrant, x, y }

    // y is 6 bits, x is 6 bits, quadrant is 2 bits
    // const num = ((quadrant << 12) | (x << 6) | y) + 65
    // const char = String.fromCharCode(num)

    //    global.packedRoomNames[roomName] = char
    //    global.unpackedRoomNames[char] = roomName
    //     }
    //     return global.packedRoomNames[roomName]
}

/**
 * Packs a roomName as a single utf-16 character. Character values are stored on permacache.
 */
// function unpackRoomName(char: string) {
//     if (global.unpackedRoomNames[char] === undefined) {
//            const num = char.charCodeAt(0) - 65
//            const { q, x, y } = {
//                q: (num & 0b11000000111111) >>> 12,
//                x: (num & 0b00111111000000) >>> 6,
//                y: num & 0b00000000111111,
//            }

//         let roomName: string
//         switch (q) {
//             case 0:
//                 roomName = `W${x}N${y}`
//                 break
//             case 1:
//                 roomName = `W${x}S${y}`
//                 break
//             case 2:
//                 roomName = `E${x}N${y}`
//                 break
//             case 3:
//                 roomName = `E${x}S${y}`
//                 break
//             default:
//                 roomName = 'ERROR'
//         }

//         global.packedRoomNames[roomName] = char
//         global.unpackedRoomNames[char] = roomName
//     }
//     return global.unpackedRoomNames[char]
// }
function unpackRoomName(q: number, x: number, y: number) {
    let roomName: string
    switch (q) {
        case 0:
            roomName = `W${x}N${y}`
            break
        case 1:
            roomName = `W${x}S${y}`
            break
        case 2:
            roomName = `E${x}N${y}`
            break
        case 3:
            roomName = `E${x}S${y}`
            break
        default:
            roomName = 'ERROR'
    }
    return roomName
}

/**
 * Packs a RoomPosition as a pair utf-16 characters. The seemingly strange choice of encoding value ((x << 6) | y) + 65
 * was chosen to be fast to compute (x << 6 | y is significantly faster than 50 * x + y) and to avoid control
 * characters, as "A" starts at character code 65.
 *
 * Benchmarking: average of 150ns to execute on shard2 public server, reduce stringified size by 90%
 */
export function packPos(pos: RoomPosition) {
    const map = packRoomName(pos.roomName)
    return pos_Codec.encode([map.quadrant, map.x, map.y, pos.x, pos.y])
    //     return packCoord(pos) + packRoomName(pos.roomName)
}

/**
 * Packs a RoomPosition as a pair utf-16 characters. The seemingly strange choice of encoding value ((x << 6) | y) + 65
 * was chosen to be fast to compute (x << 6 | y is significantly faster than 50 * x + y) and to avoid control
 * characters, as "A" starts at character code 65.
 *
 * Benchmarking: average of 150ns to execute on shard2 public server, reduce stringified size by 90%
 */
export function packXYAsPos(x: number, y: number, roomName: string) {
    const map = packRoomName(roomName)
    return pos_Codec.encode([map.quadrant, map.x, map.y, x, y])
    // return packXYAsCoord(x, y) + packRoomName(roomName)
}

/**
 * Unpacks a RoomPosition stored as a pair of utf-16 characters.
 *
 * Benchmarking: average of 600ns to execute on shard2 public server.
 */
export function unpackPos(chars: string) {
    const pos = pos_Codec.decode(chars) as [number, number, number, number, number]
    return new RoomPosition(pos[3], pos[4], unpackRoomName(pos[0], pos[1], pos[2]))
    //     const { x, y } = unpackCoord(chars[0])
    //     return new RoomPosition(x, y, unpackRoomName(chars[1]))
}

/**
 * Packs a list of RoomPositions as a utf-16 string. This is better than having a list of packed RoomPositions, as it
 * avoids extra commas and "" when memroy gets stringified.
 *
 * Benchmarking: average of 150ns per position to execute on shard2 public server, reduce stringified size by 95%
 */
export function packPosList(posList: RoomPosition[]) {
    let str = ''
    const maxLength = posList.length
    for (let i = 0; i < maxLength; i++) {
        //    str += packPos(posList[i])
        str += packXYAsPos(posList[i].x, posList[i].y, posList[i].roomName)
    }
    return str
}

/**
 * Unpacks a list of RoomPositions stored as a utf-16 string.
 *
 * Benchmarking: average of 1.5us per position to execute on shard2 public server.
 */
export function unpackPosList(chars: string) {
    const posList: RoomPosition[] = []
    for (let i = 0; i < chars.length; i += 2) {
        // for (let i = 0; i < chars.length; i += 2) {
        posList.push(unpackPos(chars[i] + chars[i + 1]))
        //    posList.push(unpackPos(chars.substr(i, 2)))
    }
    return posList
}
