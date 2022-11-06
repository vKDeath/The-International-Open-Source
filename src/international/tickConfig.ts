import { allyManager } from 'international/simpleAllies'
import {
    AllyCreepRequestData,
    antifaRoles,
    ClaimRequestData,
    CombatRequestData,
    creepRoles,
    haulerUpdateDefault,
    myColors,
    powerCreepClassNames,
    RemoteData,
    remoteRoles,
    stamps,
} from './constants'
import {
    advancedFindDistance,
    createPosMap,
    customLog,
    findCarryPartsRequired,
    findClosestRoomName,
    randomTick,
} from './utils'
import { internationalManager, InternationalManager } from './internationalManager'
import { globalStatsUpdater, statsManager } from './statsManager'
import { indexOf } from 'lodash'
import { CommuneManager } from 'room/commune/communeManager'
import { powerCreepClasses } from 'room/creeps/powerCreepClasses'

class TickConfig {
    public run() {
        // If CPU logging is enabled, get the CPU used at the start

        if (Memory.CPULogging === true) var managerCPUStart = Game.cpu.getUsed()

        this.configGeneral()
        statsManager.internationalPreTick()
        this.configRooms()
        this.configClaimRequests()
        this.configAllyCreepRequests()
        this.configCombatRequests()

        if (Memory.CPULogging === true) {
            const cpuUsed = Game.cpu.getUsed() - managerCPUStart
            customLog('Tick Config', cpuUsed.toFixed(2), myColors.white, myColors.lightBlue)
            const statName: InternationalStatNames = 'tccu'
            globalStatsUpdater('', statName, cpuUsed, true)
        }
    }
    private configGeneral() {
        // General

        global.communes = new Set()

        // global

        global.constructionSitesCount = Object.keys(Game.constructionSites).length
        global.logs = ``
    }
    private configRooms() {
        // Configure rooms

        for (const roomName in Game.rooms) {
            const room = Game.rooms[roomName]
            const roomMemory = room.memory

            // Every 100~ ticks

            if (Game.time - roomMemory.LST > Math.floor(Math.random() * 200)) {
                room.basicScout()
                room.cleanMemory()
            }

            room.moveRequests = new Map()
            room.creepPositions = new Map()
            room.powerCreepPositions = new Map()

            // Single tick properties

            room.myCreeps = {}
            for (const role of creepRoles) room.myCreeps[role] = []

            room.myPowerCreeps = {}
            for (const className of powerCreepClassNames) room.myPowerCreeps[className] = []

            room.myCreepsAmount = 0
            room.myPowerCreepsAmount = 0

            room.creepsOfSourceAmount = []

            room.powerTasks = {}

            for (const index in room.sources) room.creepsOfSourceAmount.push(0)

            room.squadRequests = new Set()

            this.configCommune(room)
        }
    }
    private configCommune(room: Room) {

        // Check if the room is a commune

        const { controller } = room
        if (!controller) return

        room.communeManager = global.communeManagers[room.name]

        if (!room.communeManager) {
            room.communeManager = new CommuneManager()
            global.communeManagers[room.name] = room.communeManager
        }

        room.communeManager.update(room)

        const roomMemory = Memory.rooms[room.name]

        if (controller.my) room.memory.T = 'commune'

        if (room.memory.T != 'commune') return

        // Iterate if the controller is not mine

        if (!controller.my) {
            room.memory.T = 'neutral'
            return
        }

        // The room is a commune

        if (!roomMemory.GRCL || controller.level > roomMemory.GRCL) roomMemory.GRCL = controller.level

        if (!room.memory.combatRequests) room.memory.combatRequests = []
/*
        for (const requestName of room.memory.combatRequests) {
            if (internationalManager.creepsByCombatRequest[requestName]) continue

            internationalManager.creepsByCombatRequest[requestName] = {}
            for (const role of antifaRoles) internationalManager.creepsByCombatRequest[requestName][role] = []
        }

        for (const requestName of room.memory.haulRequests) {
            if (internationalManager.creepsByHaulRequest[requestName]) continue

            internationalManager.creepsByHaulRequest[requestName] = []
        }
 */
        room.spawnRequests = {}

        if (!room.memory.remotes) room.memory.remotes = []

        // If there is no Hauler Size

        if (!room.memory.MHC) {
            room.memory.MHC = 0
            room.memory.HU = 0
        }

        room.haulerSizeManager()
        room.communeManager.remotesManager.stage1()

        // Add roomName to commune list

        global.communes.add(room.name)

        room.creepsOfRemote = {}

        for (let index = room.memory.remotes.length - 1; index >= 0; index -= 1) {
            const remoteName = room.memory.remotes[index]
            room.creepsOfRemote[remoteName] = {}
            for (const role of remoteRoles) room.creepsOfRemote[remoteName][role] = []
        }

        // For each role, construct an array for creepsFromRoom

        room.creepsFromRoom = {}
        for (const role of creepRoles) room.creepsFromRoom[role] = []

        room.creepsFromRoomAmount = 0

        if (!room.memory.stampAnchors) {
            room.memory.stampAnchors = {}

            for (const type in stamps) room.memory.stampAnchors[type as StampTypes] = []
        }

        if (room.creepsFromRoom.scout) room.scoutTargets = new Set()

        if (!room.memory.deposits) room.memory.deposits = {}

        room.attackingDefenderIDs = new Set()
        room.defenderEnemyTargetsWithDamage = new Map()
        room.defenderEnemyTargetsWithDefender = new Map()
    }
    private configClaimRequests() {
        let reservedGCL = Game.gcl.level - global.communes.size

        // Subtract the number of claimRequests with responders

        for (const roomName in Memory.claimRequests) {
            if (!Memory.claimRequests[roomName].responder) continue

            reservedGCL -= 1
        }

        const communesForResponding = []

        for (const roomName of global.communes) {
            if (Memory.rooms[roomName].claimRequest) continue

            if (Game.rooms[roomName].energyCapacityAvailable < 650) continue

            const room = Game.rooms[roomName]
            if (!room.structures.spawn.length) continue

            communesForResponding.push(roomName)
        }

        // Assign and abandon claimRequests, in order of score

        for (const roomName of internationalManager.claimRequestsByScore) {
            const request = Memory.claimRequests[roomName]

            if (!request) continue

            if (request.data[ClaimRequestData.abandon] > 0) {
                request.data[ClaimRequestData.abandon] -= 1
                continue
            }

            delete request.data[ClaimRequestData.abandon]

            if (request.responder && global.communes.has(request.responder)) continue

            if (!Memory.autoClaim) continue

            // If there is not enough reserved GCL to make a new request

            if (reservedGCL <= 0) continue

            // If the requested room is no longer neutral

            const type = Memory.rooms[roomName].T

            if (type !== 'neutral' && type !== 'commune') {
                // Delete the request

                Memory.claimRequests[roomName].data[ClaimRequestData.abandon] = 20000
                continue
            }

            const communeName = findClosestRoomName(roomName, communesForResponding)
            if (!communeName) break

            const maxRange = 10

            // Run a more simple and less expensive check, then a more complex and expensive to confirm. If the check fails, abandon the room for some time

            if (
                Game.map.getRoomLinearDistance(communeName, roomName) > maxRange ||
                advancedFindDistance(communeName, roomName, {
                    typeWeights: {
                        keeper: Infinity,
                        enemy: Infinity,
                        ally: Infinity,
                    },
                }) > maxRange
            ) {
                Memory.claimRequests[roomName].data[ClaimRequestData.abandon] = 20000
                continue
            }

            // Otherwise assign the request to the room, and record as such in Memory

            Memory.rooms[communeName].claimRequest = roomName
            Memory.claimRequests[roomName].responder = communeName

            reservedGCL -= 1

            communesForResponding.splice(indexOf(communesForResponding, communeName), 1)
        }
    }
    private configAllyCreepRequests() {
        // Decrease abandonment for abandoned allyCreepRequests, and find those that aren't abandon responders

        for (const roomName in Memory.allyCreepRequests) {
            const request = Memory.allyCreepRequests[roomName]

            if (request.data[AllyCreepRequestData.abandon] > 0) {
                request.data[AllyCreepRequestData.abandon] -= 1
                continue
            }

            request.data[AllyCreepRequestData.abandon] = undefined

            if (request.responder) continue

            const communes = []

            for (const roomName of global.communes) {
                if (Memory.rooms[roomName].allyCreepRequest) continue

                const room = Game.rooms[roomName]
                if (!room.structures.spawn.length) continue

                communes.push(roomName)
            }

            const communeName = findClosestRoomName(roomName, communes)
            if (!communeName) break

            const maxRange = 25

            // Run a more simple and less expensive check, then a more complex and expensive to confirm

            if (
                Game.map.getRoomLinearDistance(communeName, roomName) > maxRange ||
                advancedFindDistance(communeName, roomName, {
                    typeWeights: {
                        keeper: Infinity,
                        enemy: Infinity,
                        ally: Infinity,
                    },
                }) > maxRange
            ) {
                request.data[AllyCreepRequestData.abandon] = 20000
                continue
            }

            // Otherwise assign the request to the room, and record as such in Memory

            Memory.rooms[communeName].allyCreepRequest = roomName
            request.responder = communeName
        }
    }
    private configCombatRequests() {
        // Assign and decrease abandon for combatRequests

        for (const requestName in Memory.combatRequests) {
            const request = Memory.combatRequests[requestName]

            if (request.data[CombatRequestData.abandon] > 0) {
                request.data[CombatRequestData.abandon] -= 1
                continue
            }

            if (request.responder) {
                internationalManager.creepsByCombatRequest[requestName] = {}
                for (const role of antifaRoles) internationalManager.creepsByCombatRequest[requestName][role] = []
                continue
            }

            // Filter communes that don't have the combatRequest target already

            const communes = []

            for (const roomName of global.communes) {
                if (Memory.rooms[roomName].combatRequests.includes(requestName)) continue

                const room = Game.rooms[roomName]
                if (!room.structures.spawn.length) continue

                // Ensure we aren't responding to too many requests for our energy level

                if (room.storage && room.controller.level >= 4) {
                    if (
                        room.resourcesInStoringStructures.energy / (20000 + room.controller.level * 1000) <
                        room.memory.combatRequests.length
                    )
                        continue
                } else {
                    if (room.estimateIncome() / 10 < room.memory.combatRequests.length) continue
                }

                communes.push(roomName)
            }

            const communeName = findClosestRoomName(requestName, communes)
            if (!communeName) break

            const maxRange = 18

            // Run a more simple and less expensive check, then a more complex and expensive to confirm

            if (
                Game.map.getRoomLinearDistance(communeName, requestName) > maxRange ||
                advancedFindDistance(communeName, requestName, {
                    typeWeights: {
                        keeper: Infinity,
                        enemy: Infinity,
                        ally: Infinity,
                    },
                }) > maxRange
            ) {
                request.data[CombatRequestData.abandon] = 20000
                continue
            }

            // Otherwise assign the request to the room, and record as such in Memory

            Memory.rooms[communeName].combatRequests.push(requestName)
            request.responder = communeName

            internationalManager.creepsByCombatRequest[requestName] = {}
            for (const role of antifaRoles) internationalManager.creepsByCombatRequest[requestName][role] = []
        }
    }

    private configHaulRequests() {
        // Assign and decrease abandon for combatRequests

        for (const requestName in Memory.haulRequests) {
            const request = Memory.combatRequests[requestName]

            if (request.data[CombatRequestData.abandon] > 0) {
                request.data[CombatRequestData.abandon] -= 1
                continue
            }

            if (request.responder) {
                internationalManager.creepsByCombatRequest[requestName] = {}
                for (const role of antifaRoles) internationalManager.creepsByCombatRequest[requestName][role] = []
                continue
            }

            // Filter communes that don't have the combatRequest target already

            const communes = []

            for (const roomName of global.communes) {
                if (Memory.rooms[roomName].combatRequests.includes(requestName)) continue

                const room = Game.rooms[roomName]
                if (!room.structures.spawn.length) continue

                // Ensure we aren't responding to too many requests for our energy level

                if (room.storage && room.controller.level >= 4) {
                    if (
                        room.resourcesInStoringStructures.energy / (20000 + room.controller.level * 1000) <
                        room.memory.combatRequests.length
                    )
                        continue
                } else {
                    if (room.estimateIncome() / 10 < room.memory.combatRequests.length) continue
                }

                communes.push(roomName)
            }

            const communeName = findClosestRoomName(requestName, communes)
            if (!communeName) break

            const maxRange = 18

            // Run a more simple and less expensive check, then a more complex and expensive to confirm

            if (
                Game.map.getRoomLinearDistance(communeName, requestName) > maxRange ||
                advancedFindDistance(communeName, requestName, {
                    typeWeights: {
                        keeper: Infinity,
                        enemy: Infinity,
                        ally: Infinity,
                    },
                }) > maxRange
            ) {
                request.data[CombatRequestData.abandon] = 20000
                continue
            }

            // Otherwise assign the request to the room, and record as such in Memory

            Memory.rooms[communeName].combatRequests.push(requestName)
            request.responder = communeName

            internationalManager.creepsByCombatRequest[requestName] = {}
            for (const role of antifaRoles) internationalManager.creepsByCombatRequest[requestName][role] = []
        }
    }
}

export const tickConfig = new TickConfig()
