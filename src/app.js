const express = require('express');
const bodyParser = require('body-parser');
const { Op } = require("sequelize");
const {sequelize, Contract, Profile, Job} = require('./model') //TODO: import models directly
const {getProfile} = require('./middleware/getProfile')
const contract = require('./controllers/contract.controller')
const app = express();
app.use(contract)
app.use(bodyParser.json());
app.set('sequelize', sequelize)
app.set('models', sequelize.models)




/**
 * FIX ME!
 * @returns contract by id
 */
// app.get('/contracts/:id',getProfile ,async (req, res) =>{
//     const {id: profileId} = req.profile
//     const {Contract} = req.app.get('models')
//     const {id} = req.params
//     const contract = await Contract.findOne({where: {id}})
//     if(!contract) return res.status(404).end()
//     if(contract.ContractorId !== profileId && contract.ClientId !== profileId) {
//         return res.status(403).end()
//     }
//     res.json(contract)
// })


// app.get('/contracts/', getProfile,  async(req, res) => {
//     const {id: profileId} = req.profile
//     const { Contract } = req.app.get('models')
//     const contracts = await Contract.findAll({
//         where: {
//             [Op.not]: [{status: 'terminated'}], //TODO: use enum instead of string
//             [Op.or]: [{ContractorId: profileId}, {ClientId: profileId}]
//         }
//     })
//     res.json(contracts)
// })

app.get('/jobs/unpaid', getProfile, async(req, res) => {
    const {id: profileId} = req.profile
    const {Job} = req.app.get('models')
    const jobs = await Job.findAll({where: { //TODO: fix db
        paid: { [Op.or]: [null,false]  }        
    },
    include: {  //TODO: don't need to get all fields just filter
        model: Contract,
        where: { [Op.or]: [{ContractorId: profileId}, {ClientId: profileId}],
        [Op.not]: [{status: 'terminated'}]
        }
    }
})
    res.json(jobs)
})

app.post('/jobs/:jobId/pay', getProfile, async(req, res) => { //TODO: job_id -> jobId
    const {id: profileId} = req.profile
    const jobId = req.params['jobId']
    const jobToPay = await Job.findOne({
        where: {id: jobId, paid: {[Op.or]: [null, false]}},
        include: {  //TODO: don't need to get all fields just filter
            model: Contract,
            include: {
                model: Profile,
                as: 'Client'
            } 
        }
    })
 
    if(!jobToPay) return res.status(404).end()
    if(jobToPay.Contract.ClientId !== profileId) return res.status(403).end() //TODO: enum
    if(jobToPay.price > jobToPay.Contract.Client.balance) return res.status(400).end()

    const transaction = await sequelize.transaction()

    try{
        await Profile.decrement('balance', {by: jobToPay.price, where: {id: jobToPay.Contract.ClientId}}, {transaction})
        await Profile.increment('balance', {by: jobToPay.price, where: {id: jobToPay.Contract.ContractorId}}, {transaction})
        await Job.update({paid: true, paymentDate: new Date().toISOString()}, {where: {id: jobId}})
        await transaction.commit()
    } catch(error) {
        await transaction.rollback()
    }

   
    res.status(200).end()
})

app.get('/profile', getProfile, async(req, res) => {
    res.json(req.profile)
})

app.post('/balances/deposit/:userId', async(req, res) => {  //TODO: don't need to pass userId or verify user existence
    const {amount} = req.body
    if(!amount) return res.status(400).send({message:"amount is required"})

    const userId = req.params['userId']

    const jobsToPay = await Job.findAll({
        where: {paid: { [Op.or]: [null,false]  }},
        include: {  //TODO: don't need to get all fields just filter
            model: Contract,
            where: {ClientId: userId}
        }
    })

    const totalAmountToPay = jobsToPay.reduce((accumulator, currentValue) => {
        return accumulator + currentValue.price;
      }, 0);

    if(amount > 0.25 * totalAmountToPay) 
        return res.status(400).send({message:"amount should not be greater than 25% of total of jobs to pay"}).end()

    const result = await Profile.increment('balance', {by: amount, where: {id: userId}})       
    res.json(result)
}) 

app.get('/admin/best-profession', async(req, res) => {
    const start = req.query['start']
    const end = req.query['end']

    if(!start || !end) return res.status(400).send({message:'start and end are required'})
    
    const jobs = await Job.findAll({   //TODO: validate in case it can't find any jobs
        where: {paymentDate: {[Op.between]: [start, end]}},
        include: {
            model: Contract,
            include: {
                    model: Profile,
                    as: 'Contractor'
                }
            
        }
    })

    let maxProfession = ''
    let maxMoney = 0

    const jobMoney = new Map()
    jobs.forEach(job => {
        const profession = job.Contract.Contractor.profession
        if(!jobMoney.has(profession)) 
            jobMoney.set(profession, job.price)
        else
            jobMoney.set(profession, jobMoney.get(profession) + job.price)

        if(jobMoney.get(profession) > maxMoney)
        {
            maxMoney = jobMoney.get(profession)
            maxProfession = profession
        }

    })

    res.json({maxProfession, maxMoney}) //TODO: handle cases in which more than one has the max value
})

app.get('/admin/best-clients', async(req, res) => {
    const start = req.query['start']
    const end = req.query['end']
    const limit = req.query['limit'] ?? 2

    if(!start || !end) return res.status(400).send({message:'start and end are required'})

    const jobs = await Job.findAll({   //TODO: validate in case it can't find any jobs
        where: {paymentDate: {[Op.between]: [start, end]}},
        include: {
            model: Contract,
            include: {
                    model: Profile,
                    as: 'Client'
                }
            
        }
    })

    const jobMoney = new Map()
    jobs.forEach(job => {
        const clientFirstName = job.Contract.Client.firstName
        const clientLastName = job.Contract.Client.lastName
        const clientId = job.Contract.Client.id

        const client = {
            id: clientId,
            fullName: `${clientFirstName} ${clientLastName}`,
            paid: job.price
        }

        if(!jobMoney.has(clientId)) 
            jobMoney.set(clientId, client)
        else
            jobMoney.set(clientId, {...client, paid: jobMoney.get(clientId).paid +  job.price})
    })

    const mapEntries = Array.from(jobMoney.entries())
    mapEntries.sort((a,b) => b[1].paid - a[1].paid)
  
    res.json(mapEntries.slice(0, limit).map(entry => entry[1]))
})

module.exports = app;
