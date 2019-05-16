module.exports = {
    transports: {
        main: {
            maxsize: 100 * 1000 * 1000, // 500Mb
            maxFiles: 4

        },
        error: {
            maxsize: 10 * 1000 * 1000, // 10Mb
            maxFiles: 4
        }
    }
}