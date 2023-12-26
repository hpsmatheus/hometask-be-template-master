const { Op } = require("sequelize");
const {Contract} = require('../model')
const exception = require('../exception')


async function getContractById(id, profileId) {
    const contract = await Contract.findOne({where: {id}})
    if(!contract) throw exception(404, 'contract not found')
    if(contract.ContractorId !== profileId && contract.ClientId !== profileId) {
        throw exception(403, 'contract accessible only to members')
    }
    return contract
}

async function getContracts(profileId) {
    return Contract.findAll({
        where: {
            [Op.not]: [{status: 'terminated'}], //TODO: use enum instead of string
            [Op.or]: [{ContractorId: profileId}, {ClientId: profileId}]
        }
    })
}

module.exports = {getContractById, getContracts}