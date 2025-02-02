const _ = require('lodash');
const Promise = require('bluebird');
const debug = require('@tryghost/debug')('services:routing:controllers:static');
const renderer = require('../../rendering');

function processQuery(query, locals) {
    const api = require('../../proxy').api;
    query = _.cloneDeep(query);

    // CASE: If you define a single data key for a static route (e.g. data: page.team), this static route will represent
    //       the target resource. That means this static route has to behave the same way than the original resource url.
    //       e.g. the meta data package needs access to the full resource including relations.
    //       We override the `include` property for now, because the full data set is required anyway.
    if (_.get(query, 'resource') === 'posts' || _.get(query, 'resource') === 'pages') {
        _.extend(query.options, {
            include: 'authors,tags,tiers'
        });
    }

    Object.assign(query.options, {
        context: {
            member: locals.member
        }
    });

    return api[query.controller][query.type](query.options);
}

/**
 * @description Static route controller.
 * @param {Object} req
 * @param {Object} res
 * @param {Function} next
 * @returns {Promise}
 */
module.exports = function staticController(req, res, next) {
    debug('staticController', res.routerOptions);

    let props = {};

    _.each(res.routerOptions.data, function (query, name) {
        props[name] = processQuery(query, res.locals);
    });

    return Promise.props(props)
        .then(function handleResult(result) {
            let response = {};

            if (res.routerOptions.data) {
                response.data = {};

                _.each(res.routerOptions.data, function (config, name) {
                    response.data[name] = result[name][config.resource];

                    if (config.type === 'browse') {
                        response.data[name].meta = result[name].meta;
                        // @TODO: remove in Ghost 3.0 (see https://github.com/TryGhost/Ghost/issues/10434)
                        response.data[name][config.resource] = result[name][config.resource];
                    }
                });
            }

            renderer.renderer(req, res, renderer.formatResponse.entries(response));
        })
        .catch(renderer.handleError(next));
};
