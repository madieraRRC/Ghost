const should = require('should');
const sinon = require('sinon');
const Promise = require('bluebird');
const errors = require('@tryghost/errors');
const db = require('../../../../../core/server/data/db');
const exporter = require('../../../../../core/server/data/exporter');
const schema = require('../../../../../core/server/data/schema');
const models = require('../../../../../core/server/models');
const schemaTables = Object.keys(schema.tables);

describe('Exporter', function () {
    let tablesStub;
    let queryMock;
    let knexMock;

    before(function () {
        models.init();
    });

    afterEach(function () {
        sinon.restore();
    });

    describe('doExport', function () {
        beforeEach(function () {
            tablesStub = sinon.stub(schema.commands, 'getTables').returns(schemaTables);

            queryMock = {
                whereNot: sinon.stub(),
                select: sinon.stub()
            };

            knexMock = sinon.stub().returns(queryMock);

            sinon.stub(db, 'knex').get(function () {
                return knexMock;
            });
        });

        it('should try to export all the correct tables (without excluded)', function (done) {
            exporter.doExport().then(function (exportData) {
                // NOTE: 11 default tables
                const expectedCallCount = 11;

                should.exist(exportData);

                exportData.meta.version.should.match(/\d+.\d+.\d+/gi);

                tablesStub.calledOnce.should.be.true();
                db.knex.called.should.be.true();

                knexMock.callCount.should.eql(expectedCallCount);
                queryMock.select.callCount.should.have.eql(expectedCallCount);

                knexMock.getCall(0).args[0].should.eql('newsletters');
                knexMock.getCall(1).args[0].should.eql('posts');
                knexMock.getCall(2).args[0].should.eql('posts_meta');
                knexMock.getCall(3).args[0].should.eql('users');
                knexMock.getCall(4).args[0].should.eql('posts_authors');
                knexMock.getCall(5).args[0].should.eql('roles');
                knexMock.getCall(6).args[0].should.eql('roles_users');
                knexMock.getCall(7).args[0].should.eql('settings');
                knexMock.getCall(8).args[0].should.eql('tags');
                knexMock.getCall(9).args[0].should.eql('posts_tags');
                knexMock.getCall(10).args[0].should.eql('custom_theme_settings');

                done();
            }).catch(done);
        });

        it('should try to export all the correct tables with extra tables', function (done) {
            const include = ['mobiledoc_revisions', 'email_recipients'];

            exporter.doExport({include}).then(function (exportData) {
                // NOTE: 11 default tables + 2 includes
                const expectedCallCount = 13;

                should.exist(exportData);

                exportData.meta.version.should.match(/\d+.\d+.\d+/gi);

                tablesStub.calledOnce.should.be.true();
                db.knex.called.should.be.true();
                queryMock.select.called.should.be.true();

                knexMock.callCount.should.eql(expectedCallCount);
                queryMock.select.callCount.should.have.eql(expectedCallCount);

                knexMock.getCall(0).args[0].should.eql('newsletters');
                knexMock.getCall(1).args[0].should.eql('posts');
                knexMock.getCall(2).args[0].should.eql('posts_meta');
                knexMock.getCall(3).args[0].should.eql('users');
                knexMock.getCall(4).args[0].should.eql('posts_authors');
                knexMock.getCall(5).args[0].should.eql('roles');
                knexMock.getCall(6).args[0].should.eql('roles_users');
                knexMock.getCall(7).args[0].should.eql('settings');
                knexMock.getCall(8).args[0].should.eql('tags');
                knexMock.getCall(9).args[0].should.eql('posts_tags');
                knexMock.getCall(10).args[0].should.eql('mobiledoc_revisions');
                knexMock.getCall(11).args[0].should.eql('email_recipients');
                knexMock.getCall(12).args[0].should.eql('custom_theme_settings');

                done();
            }).catch(done);
        });

        it('should catch and log any errors', function (done) {
            // Setup for failure
            queryMock.select.returns(Promise.reject({}));

            // Execute
            exporter.doExport()
                .then(function () {
                    done(new Error('expected error for export'));
                })
                .catch(function (err) {
                    (err instanceof errors.DataExportError).should.eql(true);
                    done();
                });
        });
    });

    describe('exportFileName', function () {
        it('should return a correctly structured filename', function (done) {
            const settingsStub = sinon.stub(models.Settings, 'findOne').returns(
                new Promise.resolve({
                    get: function () {
                        return 'testblog';
                    }
                })
            );

            exporter.fileName().then(function (result) {
                should.exist(result);
                settingsStub.calledOnce.should.be.true();
                result.should.match(/^testblog\.ghost\.[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{2}\.json$/);

                done();
            }).catch(done);
        });

        it('should return a correctly structured filename if settings is empty', function (done) {
            const settingsStub = sinon.stub(models.Settings, 'findOne').returns(
                new Promise.resolve()
            );

            exporter.fileName().then(function (result) {
                should.exist(result);
                settingsStub.calledOnce.should.be.true();
                result.should.match(/^ghost\.[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{2}\.json$/);

                done();
            }).catch(done);
        });

        it('should return a correctly structured filename if settings errors', function (done) {
            const settingsStub = sinon.stub(models.Settings, 'findOne').returns(
                new Promise.reject()
            );

            exporter.fileName().then(function (result) {
                should.exist(result);
                settingsStub.calledOnce.should.be.true();
                result.should.match(/^ghost\.[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{2}\.json$/);

                done();
            }).catch(done);
        });
    });

    describe('Export table allowlists', function () {
        it('should be fixed when db schema introduces new tables', function () {
            const {
                BACKUP_TABLES,
                TABLES_ALLOWLIST
            } = require('../../../../../core/server/data/exporter/table-lists.js');

            const nonSchemaTables = ['migrations', 'migrations_lock'];
            const requiredTables = schemaTables.concat(nonSchemaTables);
            // NOTE: You should not add tables to this list unless they are temporary
            const ignoredTables = ['temp_member_analytic_events'];

            const expectedTables = requiredTables.filter(table => !ignoredTables.includes(table)).sort();
            const actualTables = BACKUP_TABLES.concat(TABLES_ALLOWLIST).sort();

            // NOTE: this test is serving a role of a reminder to have a look into exported tables allowlists
            //       if it failed you probably need to add or remove a table entry from table-lists module
            should.deepEqual(actualTables, expectedTables);
        });

        it('should be fixed when default settings is changed', function () {
            const {
                SETTING_KEYS_BLOCKLIST
            } = require('../../../../../core/server/data/exporter/table-lists.js');
            const defaultSettings = require('../../../../../core/server/data/schema/default-settings/default-settings.json');

            const totalKeysLength = Object.keys(defaultSettings).reduce((acc, curr, index) => {
                return acc + Object.keys(defaultSettings[curr]).length;
            }, 0);

            // NOTE: if default settings changed either modify the settings keys blocklist or increase allowedKeysLength
            //       This is a reminder to think about the importer/exporter scenarios ;)
            const allowedKeysLength = 69;
            totalKeysLength.should.eql(SETTING_KEYS_BLOCKLIST.length + allowedKeysLength);
        });
    });
});
