const express = require('express');
const contract = express()
const {getProfile} = require('../middleware/getProfile')
const service = require('../services/contract.service')

contract.get('/contracts/:id',getProfile ,async (req, res) =>{
    try{
        const {id: profileId} = req.profile
        const {id} = req.params
        const contract = await service.getContractById(id, profileId)
        res.json(contract)
    } catch(error) {
        res.status(error.status ?? 500).send(error.data)
    }
})


contract.get('/contracts/', getProfile,  async(req, res) => {
    try{
    const {id: profileId} = req.profile
    const contracts = await service.getContracts(profileId)
    res.json(contracts)
    } catch(error) {
        res.status(error.status ?? 500).send(error.data)
    }
})

module.exports = contract;