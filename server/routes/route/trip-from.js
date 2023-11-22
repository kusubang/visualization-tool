
const fs = require('fs-extra')

const { config } = require('../../globals')

module.exports = async (req, res, next) => {

  const { params: { id } } = req

  try {
    const from = await fs.readFile(`${config.base}/route/${id}/trip_from.json`)
    const to = await fs.readFile(`${config.base}/route/${id}/trip_to.json`)
    res.json({
      from: JSON.parse(from),
      to: JSON.parse(to)
    })

    console.log('success')

  } catch (err) {
    next(err)
  }
}
