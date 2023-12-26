function exception(status, message) {
    return {status, data: {message}}
}

module.exports = exception