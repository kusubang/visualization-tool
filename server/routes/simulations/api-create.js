/**
 * Register simulation
 *
 * author: yeonheon Gu
 * last modified: 2020-9-24
 *
 * 0. getting simulation from UI
 * 1. create config.json file for SALT simulator
 * 2. download scenario (data.zip)
 * 3. extract data.zip to simulation data directory
 * 4. add simulation info to Database
 */

const debug = require('debug')('api:create')
const fs = require('fs')
const util = require('util')
const createError = require('http-errors')

const mkdir = util.promisify(fs.mkdir)
const writeFile = util.promisify(fs.writeFile)
const unzip = util.promisify(require('extract-zip'))
const makeScenario = require('../../main/simulation-manager/make-scenario')
const downloadScenario = require('./utils/prepare-scenario')
const downloadScenarioTest = require('./utils/prepare-scenario-test')
const addSimulation = require('../../main/simulation-manager/crud/create')

const {
  updateStatus,
  currentTimeFormatted,
  getSimulations,
  config
} = require('../../globals')

const { base, server } = config
const host = server.ip
const existSimulation = id =>
  getSimulations()
    .find({ id })
    .value()
const stringify = obj => JSON.stringify(obj, false, 2)

const randomId = num =>
  ('S-' + (Math.random() * 10000000 + '').replace('.', '')).substring(0, 14) +
  '-' +
  num

async function createScenarioFile (targetDir, { host, body, id }, type) {
  await writeFile(
    `${targetDir}/doan_${type}.scenario.json`,
    stringify(makeScenario({ host, ...body, id }, type))
  )
}

const makeOptScenario = (
  id,
  { configuration: { region, begin, end, period, interval = 10 } },
  fileDir
) => {
  console.log('make scenario:', region)
  return {
    scenario: {
      id,
      host,
      port: config.server.tcpPort,
      interval,
      time: {
        begin: 0,
        end: end - begin + 60
      },
      input: {
        fileType: 'SALT',
        node: `${region}.node.xml`,
        link: `${region}.edge.xml`,
        connection: `${region}.connection.xml`,
        trafficLightSystem: `${region}.tss.xml`,
        route: `${region}.rou.xml`
      },
      parameter: {
        minCellLength: 30.0,
        vehLength: 5.0
      },
      output: {
        // fileDir: `${output}/${id}/`,
        fileDir,
        period,
        level: 'cell',
        save: 1
      }
    }
  }
}

async function createOPtScenarioFile (id, body, outDir, file) {
  const configFile = makeOptScenario(id, body, file)
  // console.log(configFile)
  await writeFile(outDir, stringify(configFile))
}

async function prepareOptimization (ids, body) {
  const targetDir = `${base}/data/${ids[0]}`
  const simOutputDir = `${base}/output/${ids[0]}`
  await mkdir(simOutputDir)

  const region = body.configuration.region // 'doan'
  // console.log('prepare simulation', body)
  const path = `/home/ubuntu/uniq-sim/routes/scenario_${region}.zip`
  await unzip(path, { dir: targetDir })

  console.log('try to rename')
  console.log(
    'rename',
    `${targetDir}/scenario_${region}`,
    'to',
    `${targetDir}/scenario`
  )
  try {
    fs.renameSync(`${targetDir}/scenario_${region}`, `${targetDir}/scenario`)
  } catch (err) {
    console.log(err)
  }
  console.log('success')

  // await mkdir(targetDir)
  // await mkdir(`${targetDir}/scenario`)
  // await mkdir(`${targetDir}/scenario/doan`)
  createOPtScenarioFile(
    ids[0],
    body,
    `${targetDir}/scenario/${region}/${region}_train.scenario.json`,
    'output/train/'
  )
  createOPtScenarioFile(
    ids[1],
    body,
    `${targetDir}/scenario/${region}/${region}_test.scenario.json`,
    'output/test/'
  )
  createOPtScenarioFile(
    ids[2],
    body,
    `${targetDir}/scenario/${region}/${region}_simulate.scenario.json`,
    'output/simulate/'
  )
  updateStatus(ids[0], 'ready', {})
}

async function prepareSimulation (id, body, role, slaves = [], type) {
  // await downloadScenario(simInputDir, body.configuration)

  if (type === 'optimization') {
    // const simInputDir = `${base}/data/${id}`
    // await mkdir(simInputDir)
    // const path = '/home/ubuntu/uniq-sim/routes/scenario.zip'
    // await unzip(path, { dir: simInputDir })
    // await addSimulation({ ...body, id, slaves, role })
    // console.log('**** add')
    // await prepareOptimization([id, ...slaves], body)
    // const file1 = makeOptScenario({ id, host, body })
  } else {
    const simInputDir = `${base}/data/${id}`
    const simOutputDir = `${base}/output/${id}`
    await mkdir(simInputDir)
    await mkdir(simOutputDir)
    await addSimulation({ ...body, id, slaves, role })
    await createScenarioFile(simInputDir, { host, body, id }, type)
    await downloadScenarioTest(simInputDir, body.configuration)
    console.log('*** caution: you have to update this scenario download ***')
    console.log('file: api-create.js, line: 55')
  }

  updateStatus(id, 'ready', {})
}

const ROLE = {
  TRAINING: 'training',
  TEST: 'test',
  FIXED: 'fixed',
  SIMULATION: 'simulation'
}

/**
 * 신호최적화 시무률레이션을 위한 입력데이터를 준비한다.
 */
module.exports = async (req, res, next) => {
  const { body: { id, type } = {} } = req
  debug(`prepare simulation ${id}`)

  if (!id) {
    next(createError(403, 'simulation ID is missed...'))
    return
  }

  if (existSimulation(id)) {
    next(createError(409, `simulation [${id}] already exists...`))
    return
  }
  console.log('type:==>', type)
  try {
    if (type === 'optimization') {
      const idTest = randomId(0) // for test
      const idFixed = randomId(1) // for fixed
      // await prepareSimulation(id, req.body, ROLE.TRAINING, [idTest, idFixed], 'optimization')
      // req.body.masterId = id
      // await prepareSimulation(idTest, req.body, ROLE.TEST, [], 'optimization')
      // await prepareSimulation(idFixed, req.body, ROLE.FIXED, [], 'optimization')
      await addSimulation({
        ...req.body,
        id,
        slaves: [idTest, idFixed],
        role: ROLE.TRAINING
      })
      await prepareOptimization([id, idTest, idFixed], req.body)
    } else {
      console.log('prepare simulation data')
      await prepareSimulation(id, req.body, ROLE.SIMULATION)
    }
    debug(`simulation ${id} is ready!`)
    res.json({ id })
  } catch (err) {
    debug(err.message)
    updateStatus(id, 'error', {
      error: `fail to create simulation - ${err.message}`,
      ended: currentTimeFormatted()
    })
    next(createError(500, err.message))
  }
}
