import { Meteor } from 'meteor/meteor';
import { Products } from '../imports/api/collections.js';
import { Csvfiles } from '../imports/api/collections.js';

Meteor.methods({
    'products.insertCSVData': function(fileID, datas) {
        let _data = [];
        datas.forEach(function(d) {
            d['fileID'] = fileID;
            d['owner'] = Meteor.userId();
            d['username'] = Meteor.user().username;
            _data.push(d);
        });
        return Products.batchInsert(_data);
    }
});