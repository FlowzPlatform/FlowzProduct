    import { Meteor } from 'meteor/meteor';
    import { Template } from 'meteor/templating';
    import { ReactiveDict } from 'meteor/reactive-dict';

    // import  Headers
    import { ProductInformationHeaders } from '../../lib/headers/product_information.js'
    import { ProductPriceHeaders } from '../../lib/headers/product_price.js'
    import { ProductImprintDataHeaders } from '../../lib/headers/product_imprint_data.js'
    import { ProductImageHeaders } from '../../lib/headers/product_images.js'
    import { ProductShippingHeaders } from '../../lib/headers/product_shipping.js'
    import { ProductAdditionalChargeHeaders } from '../../lib/headers/product_additional_charge.js'
    import { ProductVariationPricingHeaders } from '../../lib/headers/product_variation_pricing.js'


    // import  collections

    import { CollProductInformation, CollProductPricing, CollProductImprintData, CollProductImage, CollProductShipping, CollProductAdditionalCharges, CollProductVariationPrice } from '../api/collections.js';
    import { Csvfiles } from '../api/collections.js';
    import { Csvfilemapping } from '../api/collections.js';


    import './body.html';

    let abortChecked = false;
    let editor;
    Template.registerHelper('formatDate', function(date) {
        return moment(date).format('lll');
    });

    Template.readCSV.events({
        "click #btnSaveCustomjavascript": function(event, template) {
            var code = editor.getValue();
            let $selectedDom = $(template.find("a[data-target='#javascripEditorModal'].open"));
            let selectedheader = $selectedDom.attr('data-header');
            $selectedDom.attr('data-code', code).removeClass('open');
            if (code.trim() != '') {
                $selectedDom.attr('title', 'Edit').parent('td').children('.transform-function').text(code).attr('title', code);
            }
            $('#javascripEditorModal').modal('hide');

            $(template.find('#preview')).find('.spinner').show();
            // generate Preview
            generatePreview(template.find('#csv-file').files[0], template, function() {
                let ft = template.filetypes.get(); // all file type
                let activeFiletypeId = _.find(ft, function(d) { return d.isActive }).id;
                insertCSVMapping(activeFiletypeId, template, function(e, res) {
                    $(template.find('#preview')).find('.spinner').hide();
                });
            });
        },
        "click a[data-target='#javascripEditorModal']": function(event, template) {
            var currentEl = event.currentTarget;
            $(currentEl).addClass('open');
            setTimeout(function() {
                if (editor == undefined) {
                    editor = CodeMirror.fromTextArea(template.find("#customJavascript"), {
                        lineNumbers: true,
                        mode: "javascript" // set any of supported language modes here
                    });
                }
                //editor.setValue();
                let _val = $(currentEl).attr('data-code').toString();
                editor.setValue(_val);
                editor.refresh();
            }, 200);
        },
        "change #csv-file": function(event, template) {
            // Display an error toast, with a title

            let _files = [];
            abortChecked = false;

            for (let i = 0; i < template.find('#csv-file').files.length; i++) {
                let regex = new RegExp("(.*?)\.(csv)$");
                if ((regex.test(template.find('#csv-file').files[i].name))) {
                    // view file progress
                    let existFiles = template.files.get();
                    existFiles.splice(0, 0, { name: template.find('#csv-file').files[i].name, progress: 0, mapping: true });
                    template.files.set(existFiles);

                    _files.push(template.find('#csv-file').files[i]);
                }
            }
            Papa.LocalChunkSize = 1000000; // 1000kb
            for (let i = 0; i < _files.length; i++) {

                $(template.find("#upload-csv-zone")).addClass('onprogress');

                //template.find("#mapping").style.display = 'block';
                setMapping(template, function() {
                    getHeader(_files[i], template, function() {
                        generateXEditor(template, function() { // generate x-editor
                            //$(template.find("#mapping")).find('.spinner').hide();
                            $(template.find("#upload-csv-zone")).hide();
                            $(template.find("#mapping")).show();
                            $(template.find("#upload-csv-zone")).removeClass('onprogress');

                            // generate Preview
                            generatePreview(template.find('#csv-file').files[0], template, function() {
                                //template.find("#mapping").style.display = 'none';
                                $(template.find("#preview")).show();

                            });
                        });
                    });
                });
                //parseCSV(_files[i], template); // parse csv to json using papa parse
            }
        },
        "change #hasheader": function(event, template) {
            $(template.find('#mapping')).find('.spinner').show();
            getHeader(template.find('#csv-file').files[0], template, function() {
                generateXEditor(template, function() { // generate x-editor
                    $(template.find('#mapping')).find('.spinner').hide();
                    $(template.find('#preview')).find('.spinner').show();
                    setTimeout(function() {
                        // generate Preview
                        generatePreview(template.find('#csv-file').files[0], template, function() {
                            $(template.find('#preview')).find('.spinner').hide();
                        });
                    }, 1000);
                });
            });
        },
        'click #btnNext': function(event, template) {

            $(template.find('#btnNext')).addClass('inProgress');

            $(template.find('#mapping')).hide();
            $(template.find('#btnAbort')).show();
            //let mapping = generateMapping(template); // generate new Mapping

            // insert csv maaping in db

            let ft = template.filetypes.get(); // all file type
            let activeFiletypeId = _.find(ft, function(d) { return d.isActive }).id;
            insertCSVMapping(activeFiletypeId, template, function(e, res) {
                // upload csv file in db
                parseCSV(template.find('#csv-file').files[0], template, function() {
                    resetAll(template);
                });
            });
        },
        'click #btnAbort': function(event, template) {
            if (confirm('Are you sure you want to abort?')) {
                abortChecked = true;
                resetAll(template);
            }
        },
        'click #addNewHeader': function(event, template) {

        }
    });

    let setMapping = function(template, cb) {
        let _hasHeader = $(template.find('#hasheader')).prop('checked');

        let ft = Template.instance().filetypes.get(); // all file type
        let activeFiletype = _.find(ft, function(d) { return d.isActive }); // find active filetype
        let csvmapping = Csvfilemapping.findOne({ owner: Meteor.userId(), fileTypeID: activeFiletype.id, hasHeader: _hasHeader });
        if (csvmapping != undefined) {
            if (_hasHeader) {
                if (template.mappingWithHeader.get().length == 0) {
                    template.mappingWithHeader.set(csvmapping.mapping);
                }
            } else {
                if (template.mappingWithOutHeader.get().length == 0) {
                    template.mappingWithOutHeader.set(csvmapping.mapping);
                }
            }
        }
        cb();
    }

    let generateMapping = function(template) {
        // get new mapping
        let mapping = [];
        let csvHeaders = template.csvHeaders.get();

        let activefile = getActiveHeaders(template); // get active file type data

        // create mapping
        csvHeaders.forEach(function(result, index) {
            mapping.push({
                sysHeader: $(template.find('#dpdsysheader_' + index)).editable('getValue')['dpdsysheader_' + index],
                csvHeader: $(template.find('#dpdcsvheader_' + index)).text(),
                transform: $(template.find('#txtCustomJavascript_' + index)).attr('data-code'),
                csvHeaderDetail: _.find(activefile, function(d) { return d.text == $(template.find('#dpdcsvheader_' + index)).text() })
            })
        });
        template.mapping.set(mapping);
        let _hasHeader = $(template.find('#hasheader')).prop('checked');
        if (_hasHeader) {
            template.mappingWithHeader.set(mapping);
        } else {
            template.mappingWithOutHeader.set(mapping);
        }
        return mapping;
    }

    let generateXEditor = function(template, cb) {
        let activefile = _.map(getActiveHeaders(template), function(d) { return d.text }); // get active file type data

        let _csvHeader = template.csvHeaders.get();
        let _hasHeader = $(template.find('#hasheader')).prop('checked');
        // create mapping
        let ft = template.filetypes.get(); // all file type
        let activeFiletype = _.find(ft, function(d) { return d.isActive }); // find active filetype
        let existMapping; //Csvfilemapping.findOne({ owner: Meteor.userId(), fileTypeID: activeFiletype.id });

        if (_hasHeader) {
            existMapping = template.mappingWithHeader.get();
        } else {
            existMapping = template.mappingWithOutHeader.get();
        }

        setTimeout(function() {
            _csvHeader.forEach(function(result, index) {
                //let _val;
                // if (_hasHeader) {
                //     _val = getHeaderDistance(result, activefile);
                // } else {
                //     _val = activefile[index]
                // }

                $(template.find('#dpdsysheader_' + index)).editable("destroy");
                $(template.find('#dpdsysheader_' + index)).editable({
                    //value: _val.toLowerCase(),
                    emptytext: '--NA--',
                    source: activefile,
                    success: function(response, newValue) {
                        changeXEditorValue(template);
                    }
                });
                if (existMapping.length > 0) {
                    if (existMapping[index].sysHeader != undefined) {
                        $(template.find('#dpdsysheader_' + index)).editable('setValue', existMapping[index].sysHeader.toLowerCase());
                    }
                }
                // if (_val != undefined) {
                //     //$(template.find('#dpdsysheader_' + index)).editable('setValue', _val.toLowerCase());
                // }
                //activefile = _.without(activefile, _val);

                if (existMapping.length > 0) {
                    if (existMapping[index].transform.trim() != '') {
                        let code = existMapping[index].transform;
                        $(template.find('#txtCustomJavascript_' + index)).attr('data-code', code).attr('title', 'Edit').parent('td').children('.transform-function').text(code).attr('title', code);
                    }
                }
            });
            reGenerateXEditor(template);
            cb();
        }, 1000);
    }

    let reGenerateXEditor = function(template) {
        let activefile = _.map(getActiveHeaders(template), function(d) { return d.text }); // get active file type data

        let _csvHeader = template.csvHeaders.get();
        let _hasHeader = $(template.find('#hasheader')).prop('checked');
        // create mapping

        let ft = template.filetypes.get(); // all file type
        let activeFiletype = _.find(ft, function(d) { return d.isActive }); // find active filetype

        _csvHeader.forEach(function(result, index) {
            let oldValue = $(template.find('#dpdsysheader_' + index)).editable('getValue')['dpdsysheader_' + index];
            if (oldValue != undefined) {
                activefile = _.without(activefile, oldValue);
            }
        });

        _csvHeader.forEach(function(result, index) {
            let _oldvalue = $(template.find('#dpdsysheader_' + index)).editable('getValue')['dpdsysheader_' + index];
            $(template.find('#dpdsysheader_' + index)).editable("destroy");
            $(template.find('#dpdsysheader_' + index)).editable({
                value: _oldvalue,
                emptytext: '--NA--',
                source: activefile,
                success: function(response, newValue) {
                    changeXEditorValue(template);
                }
            });
        });
    }

    let changeXEditorValue = function(template) {
        //console.log('success');
        $(template.find('#preview')).find('.spinner').show();
        setTimeout(function() {
            reGenerateXEditor(template);
            generatePreview(template.find('#csv-file').files[0], template, function() {
                $(template.find('#preview')).find('.spinner').hide();
            });
        }, (500));
    }

    let resetAll = function(template) {
        $(template.find('#csv-file')).val('');
        template.find("#mapping").style.display = 'none';
        template.find("#preview").style.display = 'none';
        template.find('#btnNext').children[1].children[0].style.width = '0%';
        $(template.find('#btnNext')).removeClass('inProgress');
        $(template.find("#upload-csv-zone")).show();
        template.find('#btnNext').children[0].innerHTML = 'Proceed';
        $(template.find('#btnNext')).show();
        $(template.find('#btnAbort')).hide();
        $(template.find("#handson-Zone-during-upload")).hide();
        toastr.clear();

        // destroyXEditor

        //let activefile = template.headers.get(); // get active file type data
        //let _csvHeader = template.csvHeaders.get();
        //let _dataTypes = template.dataTypes.get();

        //console.log('dataTypes', _dataTypes);
        //console.log('csvHeader', _csvHeader);
        // create mapping
        //activefile.forEach(function(result, index) {
        //    let _val = getHeaderDistance(result.column, _csvHeader);
        //    $(template.find('#dpdcsvheader_' + index)).editable("destroy");
        //    //$(template.find('#dpddatatype_' + index)).editable("destroy");
        //});
    }

    let getHeaderDistance = function(sysColumn, csvHeaders) {
        let res = csvHeaders[0];
        // console.log(this.csvHeaders);
        let col = sysColumn;
        csvHeaders.forEach(function(d) {
            res = Levenshtein.get(col, d) < Levenshtein.get(col, res) ? d : res;
        });
        return res;
    }

    let insertCSVMapping = function(fileTypeID, template, cb) {

        let mapping = generateMapping(template); // generate new Mapping
        let _hasHeader = $(template.find('#hasheader')).prop('checked');

        let isExist = Csvfilemapping.findOne({ owner: Meteor.userId(), fileTypeID: fileTypeID, hasHeader: _hasHeader });
        if (isExist == undefined) {
            let _data = {
                mapping: mapping,
                fileTypeID: fileTypeID,
                createdAt: new Date(),
                updateAt: new Date(),
                deleteAt: null,
                hasHeader: _hasHeader,
                owner: Meteor.userId(),
                username: Meteor.user().username
            };
            Csvfilemapping.insert(_data, function(e, res) {
                cb(e, res);
            });
        } else {
            let _data = {
                mapping: mapping,
                updateAt: new Date()
            };
            Csvfilemapping.update(isExist._id, { $set: _data }, function(e, res) {
                cb(e, res);
            });
        }
    }

    // Return array of string values, or NULL if CSV string not well formed.
    let CSVtoArray = function(text) {
        let p = '',
            row = [''],
            ret = [row],
            i = 0,
            r = 0,
            s = !0,
            l;
        for (l in text) {
            l = text[l];
            if ('"' === l) {
                if (s && l === p) row[i] += l;
                s = !s;
            } else if (',' === l && s) l = row[++i] = '';
            else if ('\n' === l && s) {
                if ('\r' === p) row[i] = row[i].slice(0, -1);
                row = ret[++r] = [l = ''];
                i = 0;
            } else row[i] += l;
            p = l;
        }
        return ret.slice(0, ret.length - 1);
    };

    let arrayToCSV = function(row) {
        for (let i in row) {
            for (let j in row[i]) {
                row[i][j] = "\"" + row[i][j] + "\"";
            }
            row[i] = row[i].join(',');
        }
        return row.join('\n');
    }

    let getHeader = function(_file, template, cb) {
        let _hasHeader = $(template.find('#hasheader')).prop('checked');
        Papa.parse(_file, {
            header: _hasHeader,
            dynamicTyping: true,
            encoding: "UTF-8",
            skipEmptyLines: true,
            beforeFirstChunk: function(chunk) {
                let rows = CSVtoArray(chunk);
                let headings = rows[0]; //rows[0].map(v => v.toLowerCase());
                if (!_hasHeader) {
                    let newHeaders = [];
                    headings.forEach(function(result, index) {
                        newHeaders.push('header' + (index + 1));
                    });
                    template.csvHeaders.set(newHeaders);
                } else {
                    template.csvHeaders.set(headings);
                }
            },
            complete: function(results) {
                //console.log('results', results);
            },
            error: function(error, f) {
                console.log("ERROR:", error, f);
            },
            chunk: function(results, streamer) {
                streamer.abort();
                cb();
            }
        });
    };

    let getTransformVal = function(headings, row, transformStr, oldValue, index) {
        try {
            let code = transformStr;
            _.each(headings, function(d, index) {
                row[d] = row[index];
            });
            row['_id'] = index;
            let result = new Function("row", code).call(this, row);
            return result;
        } catch (e) {
            return oldValue;
        }
    }

    let generateDatawithNewHeader = function(chunk, _hasHeader, mapping, isPreview, template) {
        let rows = CSVtoArray(chunk);
        let headings = template.csvHeaders.get(); //  _.extend([], rows[0]);

        let oldRows = CSVtoArray(chunk);
        let activeHeaders = getActiveHeaders(template).slice(1, -1);
        // let extraHeaders = _.reject(headings, function(d) { return _.indexOf(_.map(mapping, function(v) { return v.csvHeader }), d) != -1 })

        let newHeading = _.map(mapping, function(v) { return v.csvHeader });
        //console.log('activeHeaders', activeHeaders);
        _.each(mapping, function(d, inx) {
            for (let i = _hasHeader ? 1 : 0; i < oldRows.length; i++) {
                if (d.transform.trim() != '') {
                    rows[i][inx] = getTransformVal(headings, oldRows[i], d.transform.trim(), oldRows[i][inx], i);
                } else {
                    rows[i][inx] = oldRows[i][inx];
                }
            }
            let headerText = d.csvHeader.trim();
            if (!isPreview && d.sysHeader != undefined) {
                //let mapHeader = _.find(activeHeaders, function(v) { return v.text == d.sysHeader });
                headerText = (d.csvHeaderDetail != undefined) ? d.csvHeaderDetail.column.trim() : d.csvHeader.trim();
            } else {
                headerText = (d.sysHeader != undefined && d.sysHeader != '') ? d.sysHeader.trim() : d.csvHeader.trim();
            }
            if (_hasHeader) {
                rows[0][inx] = headerText; // (d.sysHeader != undefined) ? d.sysHeader.trim() : d.csvHeader.trim();
            } else {
                newHeading[inx] = headerText; // (d.sysHeader != undefined) ? d.sysHeader.trim() : d.csvHeader.trim();
            }
        });
        return (!_hasHeader ? (newHeading.join(',') + '\n') : "") + arrayToCSV(rows);
    }

    let generatePreview = function(_file, template, cb) {
        let _hasHeader = $(template.find('#hasheader')).prop('checked');
        // generateMapping
        generateMapping(template);
        mapping = template.mapping.get();

        Papa.parse(_file, {
            header: true,
            dynamicTyping: true,
            encoding: "UTF-8",
            skipEmptyLines: true,
            beforeFirstChunk: function(chunk) {
                return generateDatawithNewHeader(chunk, _hasHeader, mapping, true, template);
            },
            complete: function(results) {
                //console.log('results', results);

            },
            error: function(error, f) {
                console.log("ERROR:", error, f);
            },
            chunk: function(results, streamer) {
                template.previewRec.set(results.data.slice(0, 5));
                streamer.abort();
                cb();
                return;
            }
        });
    };

    let setNextFile = function(template) {
        let ft = template.filetypes.get(); // all file type

        let activeFiletypeId = _.indexOf(ft, _.find(ft, function(d) { return d.isActive }));

        ft[activeFiletypeId].isActive = false;
        ft[activeFiletypeId].isDone = true;
        ft[activeFiletypeId + 1].isActive = true;

        template.filetypes.set(ft);
    }

    let parseCSV = function(_file, template, cb) {
        let _hasHeader = $(template.find('#hasheader')).prop('checked');
        // generateMapping
        generateMapping(template);
        let mapping = template.mapping.get();

        $(template.find('#btnNext')).find('.progress-inner').css({ 'width': '0%' });
        $(template.find('#btnNext')).find('.content').text('Start uploding...');
        let file = {
            name: _file.name,
            size: _file.size,
            progress: 0,
            totalNoOfRecords: 0,
            uploadedRecords: 0,
            createdAt: new Date(),
            updateAt: new Date(),
            deleteAt: '',
            owner: Meteor.userId(),
            username: Meteor.user().username
        };

        Csvfiles.insert(file, function(e, res) {
            $('#buttonProceedNext').hide();
            let fileID = res; // new file id
            //console.log('fileID', fileID);
            let chunks = 1;
            let totalRecords = 0;
            let uploadedRecords = 0;
            let progress = 0;
            Papa.parse(_file, {
                header: true,
                dynamicTyping: true,
                encoding: "UTF-8",
                skipEmptyLines: true,
                complete: function(results) {
                    console.log('complate results', results);
                    if (!abortChecked) {
                        setNextFile(template);
                    }
                    cb();
                },
                error: function(error, f) {
                    console.log("ERROR:", error, f);
                },
                step: function(results, parser) {
                    //console.log("Row:", results);
                    if (abortChecked) {
                        parser.abort();
                        return;
                    }
                    parser.pause();
                    let ft = template.filetypes.get(); // all file type
                    let activeFiletype = _.find(ft, function(d) { return d.isActive }); // find active filetype

                    insertCSVData(results.data[0], fileID, activeFiletype.collection, function() {

                        //$("#errMessageFromSchema").text('');
                        toastr.clear();

                        // calculate progress
                        ++uploadedRecords;
                        let newProgress = Math.round((uploadedRecords * 100) / totalRecords);
                        if (progress == newProgress) { parser.resume(); } else {
                            $(template.find('#btnNext')).find('.progress-inner').css({ 'width': newProgress + '%' })
                            $(template.find('#btnNext')).find('.content').text(newProgress + '% completed');

                            $(template.find('#buttonProceedNext')).find('.progress-inner').css({ 'width': newProgress + '%' })
                            $(template.find('#buttonProceedNext')).find('.content').text(newProgress + '% completed');
                            Csvfiles.update(fileID, { $set: { progress: newProgress, uploadedRecords: uploadedRecords } }, function(e, res) {
                                parser.resume();
                            });
                        }
                    });
                },
                beforeFirstChunk: function(chunk) {
                    let rows = CSVtoArray(chunk);
                    totalRecords = (_hasHeader) ? rows.length - 1 : rows.length - 0; // last row getting empty
                    Csvfiles.update(fileID, { $set: { totalNoOfRecords: totalRecords } }, function(e, res) {});
                    return generateDatawithNewHeader(chunk, _hasHeader, mapping, false, template);
                },
                // chunk: function(results, streamer) {

                //     if (!results)
                //         return;

                //     //console.log('finished', streamer.streamer._finished);
                //     //console.log('streamer', streamer.streamer);

                //     // calculate progress
                //     let progress = Math.round((streamer.streamer._config.chunkSize * chunks) / streamer.streamer._input.size * 100);
                //     progress = progress > 100 ? 100 : progress;
                //     let noOfRecords = streamer.streamer._rowCount;

                //     // insert chunk data in mongo db
                //     streamer.pause();
                //     //Meteor.call('products.insertCSVData', fileID, results.data, function() {
                //     insertCSVData(fileID, results.data, template, progress, streamer, function() {
                //         // update file progress
                //         Csvfiles.update(fileID, {
                //                 $set: { progress, noOfRecords }
                //             },
                //             function(e, res) {
                //                 if (progress < 100) {
                //                     //streamer.resume();
                //                 } else {
                //                     streamer.abort();
                //                     cb(); // callback 'parseCSV' method
                //                 }
                //             });
                //     });
                //     //console.log("Chunk data:", results.data.length, results);

                //     // update progress

                //     // let existFiles = template.files.get();
                //     // for (let i = 0; i < existFiles.length; i++) {
                //     //     if (existFiles[i].name == streamer.streamer._input.name)
                //     //         existFiles[i].progress = progress;
                //     // }
                //     // template.files.set(existFiles);
                //     //$(template.find('#btnNext')).find('.progress-inner').css({ 'width': progress + '%' })
                //     //$(template.find('#btnNext')).find('.content').text(progress + '% completed');
                //     //console.log('progress', progress);
                //     chunks++;
                // }
            });
        });
    }

    let getActiveHeaders = function(template) {
        let ft = template.filetypes.get(); // all file type
        let activeFiletype = _.find(ft, function(d) { return d.isActive }); // find active filetype
        activeFiletype.header.unshift("--NA--");
        return _.uniq(activeFiletype.header);
    }

    Template.readCSV.onCreated(function() {
        //console.log(Router.current().params.id);
        toastr.options = {
            "closeButton": true,
            "showMethod": "show",
            "hideDuration": "1000",
            "showDuration": "0",
            "timeOut": "10000000"
        }
        this.files = new ReactiveVar([]);
        this.csvHeaders = new ReactiveVar([]);
        this.headers = new ReactiveVar([]);
        this.previewRec = new ReactiveVar([]);
        this.filetypes = new ReactiveVar(
            [
                { id: 'ProductInformation', name: 'Product Information', isDone: false, isActive: true, header: ProductInformationHeaders, collection: CollProductInformation },
                { id: 'ProductPricing', name: 'Product Pricing', isDone: false, isActive: false, header: ProductPriceHeaders, collection: CollProductPricing },
                { id: 'ProductImprintData', name: 'Imprint Data', isDone: false, isActive: false, header: ProductImprintDataHeaders, collection: CollProductImprintData },
                { id: 'ProductImage', name: 'Image', isDone: false, isActive: false, header: ProductImageHeaders, collection: CollProductImage },
                { id: 'ProductShipping', name: 'Shipping', isDone: false, isActive: false, header: ProductShippingHeaders, collection: CollProductShipping },
                { id: 'ProductAdditionalCharges', name: 'Additional Charges', isDone: false, isActive: false, header: ProductAdditionalChargeHeaders, collection: CollProductAdditionalCharges },
                { id: 'ProductVariationPrice', name: 'Variation Price', isDone: false, isActive: false, header: ProductVariationPricingHeaders, collection: CollProductVariationPrice }
            ]
        );
        this.mapping = new ReactiveVar([]);
        this.mappingWithOutHeader = new ReactiveVar([]);
        this.mappingWithHeader = new ReactiveVar([]);
    });


    Template.readCSV.helpers({
        files() {
            return Template.instance().files.get();
        },
        headers() {
            let ft = Template.instance().filetypes.get(); // all file type
            let activeFiletype = _.find(ft, function(d) { return d.isActive }); // find active filetype
            //console.log('activeFiletype', activeFiletype);
            //console.log(activeFiletype.header);
            Template.instance().headers.set(activeFiletype.header);
            return Template.instance().headers.get();
        },
        csvHeaders() {
            return Template.instance().csvHeaders.get();
        },
        // distance() {
        //     let res = this.csvHeaders[0];
        //     // console.log(this.csvHeaders);
        //     let col = this.col;
        //     this.csvHeaders.forEach(function(d) {
        //         res = Levenshtein.get(col, d) < Levenshtein.get(col, res) ? d : res;
        //     });
        //     return res;
        // },
        previewRec() {
            return Template.instance().previewRec.get();
        },
        filetypes() {
            return Template.instance().filetypes.get();
        },
        mapping() {
            return Template.instance().mapping.get();
        },
        mappingWithOutHeader() {
            return Template.instance().mappingWithOutHeader.get();
        },
        mappingWithHeader() {
            return Template.instance().mappingWithHeader.get();
        },
        getJsonValues(obj) {
            return Object.values(obj);
        },
        getJsonKeys(obj) {
            return Object.keys(obj);
        }
    });

    let insertCSVData = function(data, fileID, collection, cb) {
        let copedata = $.extend({}, data);
        data['fileID'] = fileID;
        data['owner'] = Meteor.userId();
        data['username'] = Meteor.user().username;
        // console.log('data', data);
        // return;
        collection.insert(data, { validate: false }, function(err, res) {
            if (err) {
                //console.log('errmessage', err.message);
                //console.log('err', err.invalidKeys);
                //console.log('data', data);
                $("#upload-csv-zone,#preview").hide();
                $("#handson-Zone-during-upload").show();

                $('#buttonProceedNext').show().find('.content').text('Proceed To Next');
                $('#btnNext').hide();
                toastr.error(err.message);
                //$("#errMessageFromSchema").text(err.message);

                renderHandsonTable(copedata, Object.keys(copedata), 'hotErrorDataDuringUpload', err, fileID, collection, cb);
            } else {
                cb(); // callback
            }
        });
    }
    let errorRenderer = function(instance, td, row, col, prop, value, cellProperties) {
        Handsontable.renderers.TextRenderer.apply(this, arguments);
        td.style.backgroundColor = 'red';
    };

    let getHandsonHeader = function(headers, invalidKeys) {
        let newHeaders = [];
        _.each(headers, function(val, inx) {
            if (_.find(invalidKeys, function(d) { return d.name == val; }) != undefined) {
                newHeaders.push({ colHeader: val, renderer: errorRenderer, data: val })
            } else {
                newHeaders.push({ colHeader: val, data: val })
            }
        });
        return newHeaders;
    }

    let renderHandsonTable = function(dataObject, headers, eleName, error, fileID, collection, cb) {
        //Csvfiles.update(fileID, {$set: { 'errorString' :  error }});
        //  console.log(headers);
        //console.log('error', error.invalidKeys);
        //console.log('headers', headers);
        let newHeaders = getHandsonHeader(headers, error.invalidKeys);
        //console.log('newHeaders', newHeaders);
        let hotSettings = {
            data: dataObject,
            columns: newHeaders,
            stretchH: 'all',
            autoWrapRow: true,
            //height: 441,
            //maxRows: 22,
            rowHeaders: true,
            //colHeaders: getHeadersValues(headers),
            colHeaders: headers,
            afterChange: function(changes, source) {
                //updateErrorData(changes, source, dataObject, fileID);
                $("#buttonProceedNext").unbind('click').click(function() {
                    console.log('afterchange', dataObject);
                    insertCSVData(dataObject, fileID, collection, cb);
                });
            }
        };
        hotElement = document.querySelector('#' + eleName);

        objHandsontable = new Handsontable(hotElement, hotSettings);
    }

    Template.EditorPage.helpers({
        "editorOptions": function() {
            return {
                lineNumbers: true,
                mode: "javascript"
            }
        },

        "editorCode": function() {
            return "function(row){\n return row; \n};\n";
        }
    });