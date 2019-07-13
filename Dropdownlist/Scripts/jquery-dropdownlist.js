﻿(function ($) {
    /*
     * TODO
     * - Add options for attributes of container, list and selector + tests
     * - Add filter textbox + tests
     *   - Test new options
     *   - Test single: ???
     *   - Test multi: it clears when opening; it filters; clears filter; doesn't change selection?
     * - Add keyboard support? + tests
     * - Figure out licensing
     * - Figure out NuGet package?
     * - Create examples/documentation?
     * - Project for server-side MVC implementation?
     */

    // Extension for creating dropdownlists; supports multiple creations in one call
    $.fn.dropdownlist = function (settings, callback) {
        // Allow callback to be the only argument
        if ($.isFunction(settings)) {
            callback = settings;
            settings = null;
        }

        return $(this).each(function () {
            let dropdownlist;

            if ($(this).closest('.dropdownlist').length === 0) {
                let options = $.extend({}, $.fn.dropdownlist.defaults, settings);
                dropdownlist = new Dropdownlist($(this), options);

                // Add object to data
                $(this).data('dropdownlist', dropdownlist);
            }
            else {
                // Get object from data
                dropdownlist = $(this).data('dropdownlist');
            }

            // Call the callback, bound to the dropdownlist
            if ($.isFunction(callback)) {
                callback.bind(dropdownlist)(dropdownlist);
            }
        });
    }

    // Set defaults for extension
    $.fn.dropdownlist.defaults = {
        // Items are all the possible dropdown items to select
        // Defaults to all direct children of the element
        getItems: function (element) {
            return $(element).children();
        },
        // Item that triggers a select all in case of multiselect
        // Defaults to the first direct child with data-property select-all enabled
        getSelectAllItem: function (element) {
            return $(element).children().filter('[data-select-all]').first();
        },
        // Determine if an item should be selected during initialization
        // Multiple selected items for a single-select dropdownlist selects the first item
        isItemSelected: function (item) {
            return $(item).data('selected') !== undefined && $(item).data('selected') != false;
        },
        // The field name to use for the generated input fields
        // Defaults to the data-property field-name
        getFieldName: function (element) {
            return $(element).data('field-name');
        },
        // The field value to use for the generated input fields based on the item
        // Defaults to the data-property value of the item
        getItemValue: function (item) {
            return $(item).data('value') || $(item).text();
        },
        // The text to get for an item based on the item
        // Defaults to the text-content of the item
        getItemText: function (item) {
            return $(item).text();
        },
        // The text to display when no items are selected
        // Override this implementation to set the text or provide multi-language support
        getEmptyText: function () {
            return '(Select...)';
        },
        // Multiselect dropdowns use checkboxes, single select uses an invisible radio button
        // Defaults to false except when the data-property multiselect is provided
        isMultiselect: function (element) {
            return $(element).data('multiselect') !== undefined && $(element).data('multiselect') != false;
        },
        // If true, this adds a text box that can be used to search in the dropdownlist
        // Defaults to false
        hasTextSearch: function (element) {
            return $(element).data('text-search') !== undefined && $(element).data('text-search') != false;
        },
        // If text search is enabled, this is the filter that is used to determine if an item is valid
        // Defaults to searching in all the text inside the item
        itemMatchesTextSearch: function (item, searchText) {
            return $(item).text().toLocaleLowerCase().indexOf(searchText.toLocaleLowerCase()) > -1;
        }
    }

    // Dropdownlist implementation
    function Dropdownlist(element, options) {
        let base = this;
        let isItemSelected = false;

        this.element = element;
        this.options = options;
        this.fieldName = this.options.getFieldName(this.element) || 'dropdownlist-' + Math.random().toString().replace('.', '');
        this.isMultiselect = this.options.isMultiselect(this.element);
        this.selectAllItem = this.isMultiselect ? this.options.getSelectAllItem(this.element) : $();
        this.textSearch = $();
        this.items = this.options.getItems(this.element);
        this.emptyText = this.options.getEmptyText();
        this.container = $('<div>', { class: 'dropdownlist' });

        // Add container early so can move the element after without issues
        this.element.before(this.container);

        // Select element
        this.selector = $('<div>', { class: 'dropdownlist-selector' }).append(
            $('<div>', { class: 'dropdownlist-selector-text' }),
            $('<div>', { class: 'dropdownlist-selector-toggle' })
        );

        // List container
        this.list = $('<div>', { class: 'dropdownlist-list' }).append(this.element).hide();

        // Search text box
        if (this.options.hasTextSearch(this.element)) {
            this.textSearch = $('<input>', { type: 'text', class: 'dropdownlist-search' });

            if (this.isMultiselect) {
                // In multiselect mode it does not replace the selector text but rather searches in the list
                this.list.prepend(this.textSearch);
            }
            else {
                // In single-select mode it replaces the selector text and acts as an autocomplete
                this.selector.prepend(this.textSearch);
                this.textSearch.hide();
            }
        }

        // Add input fields
        this.items.each(function () {
            let fieldProperties = {};

            if (!base.isMultiselect || !base.selectAllItem.is(this)) {
                fieldProperties.name = base.fieldName;
                fieldProperties.value = base.options.getItemValue($(this));
            };

            if (base.isMultiselect) {
                fieldProperties.type = 'checkbox';
                fieldProperties.class = 'dropdownlist-field';
            }
            else {
                fieldProperties.type = 'radio';
                fieldProperties.class = 'dropdownlist-field dropdownlist-field-hidden';
            }

            if (base.options.isItemSelected($(this)) && (base.isMultiselect || !isItemSelected)) {
                fieldProperties.checked = 'true';
                isItemSelected = true;
            }

            $(this).prepend($('<input>', fieldProperties));
        });

        // For single-select, select the first option if nothing is selected
        // Having nothing selected is not a user-recoverable state
        if (!this.isMultiselect && this.getSelectedItems().length === 0) {
            this.setSelectedItems(':first');
        }

        // For multiselect, set the correct value of the select all item if it exists
        if (this.isMultiselect && this.selectAllItem.length > 0) {
            this.selectAllItem.find('input.dropdownlist-field').prop('checked', this.areAllItemsSelected());
        }

        // Final assembly
        this.container.append(this.selector);
        this.container.append(this.list);
        this.setSelectorText();

        // Event handlers
        this.selector.click(this, this.selectorClick);
        this.list.click(this, this.listClick);
        this.textSearch.keyup(this, this.textSearchKeyup);
        $(document).click(this, this.documentClick);
    }

    // Click handler for selector
    Dropdownlist.prototype.selectorClick = function (e) {
        if ($(e.target).is(e.data.textSearch)) {
            return;
        }

        e.data.toggle();
    }

    // Click handler for list
    Dropdownlist.prototype.listClick = function (e) {
        let item = $(e.target).closest('.dropdownlist-list > * > *');

        // Only bother selecting/unselecting when clicking an item
        if (item.length === 0) {
            return;
        }

        let input = item.find('input.dropdownlist-field');

        // Let the input field handle the actual click
        if (!input.is(e.target)) {
            input.click();
        }
        else {
            // Actual click handling
            if (e.data.isMultiselect && e.data.selectAllItem.length > 0) {
                // Handle clicking of the select all
                if ($(e.target).closest(e.data.selectAllItem).length > 0) {
                    if (e.data.selectAllItem.find('input.dropdownlist-field').prop('checked')) {
                        e.data.selectAllItems();
                    }
                    else {
                        e.data.clearSelectedItems();
                    }
                }
                // Set select all
                else {
                    e.data.selectAllItem.find('input.dropdownlist-field').prop('checked', e.data.areAllItemsSelected());
                }
            }

            e.data.setSelectorText();

            if (!e.data.isMultiselect) {
                e.data.toggle();
            }

            e.data.element.trigger('dropdownlist.selectedItemsChanged');
        }
    }

    // Change handler for search 
    Dropdownlist.prototype.textSearchKeyup = function (e) {
        var searchText = e.data.textSearch.val();
        var visibleItems = e.data.items;

        if (searchText) {
            visibleItems = visibleItems.filter(function () {
                return e.data.options.itemMatchesTextSearch(this, searchText);
            });
        }

        e.data.items.not(visibleItems).hide();
        visibleItems.show();
    }

    // Click handler for anywhere outside the dropdownlist
    Dropdownlist.prototype.documentClick = function (e) {
        if ($(e.target).closest('.dropdownlist').is(e.data.container)) {
            return;
        }

        e.data.hide();
    }

    // Toggle the list and the text search if needed
    Dropdownlist.prototype.toggle = function () {
        if (this.list.css('display') == 'none') {
            this.show();
        }
        else {
            this.hide();
        }
    }

    // Hide the list
    Dropdownlist.prototype.hide = function () {
        this.list.hide();

        if (this.textSearch.length > 0) {
            if (this.isMultiselect) {
                // Clear search text
                this.list.find('.dropdownlist-search').val('');
            }
            else {
                // Switch selector text and input
                this.selector.find('.dropdownlist-selector-text').show();
                this.selector.find('.dropdownlist-search').hide();

                // Set search text to current selected item text
                this.textSearch.val(this.container.find('.dropdownlist-selector-text').text());
            }

            // Clear previous searches
            this.items.show();
        }
    }

    // Show the list
    Dropdownlist.prototype.show = function () {
        this.list.show();

        if (this.textSearch.length > 0 && !this.isMultiselect) {
            // Switch selector text and input
            this.selector.find('.dropdownlist-selector-text').hide();
            this.selector.find('.dropdownlist-search').show().focus().select();
        }
    }

    // Remove the entire dropdownlist; resets the base element to its former state
    Dropdownlist.prototype.remove = function () {
        this.container.before(this.element);
        this.container.remove();
        this.items.find('input.dropdownlist-field').remove();

        // Remove object from data
        this.element.removeData('dropdownlist');
    }

    // Set the text of the selector based on current list selection
    Dropdownlist.prototype.setSelectorText = function () {
        let items = this.getSelectedItems();
        let text = this.emptyText;

        if (items.length > 0) {
            text = $.map(items, this.options.getItemText).join(', ');
        }

        this.container.find('.dropdownlist-selector-text').text(text);

        if (!this.isMultiselect && this.textSearch.length > 0) {
            this.textSearch.val(text);
        }
    }

    // Get a jQuery-object with all currently selected items
    Dropdownlist.prototype.getSelectedItems = function () {
        return this.items.has('input.dropdownlist-field:checked').not(this.selectAllItem);
    }

    // Get an array of values from all currently selected items
    Dropdownlist.prototype.getSelectedValues = function () {
        return $.map(this.getSelectedItems(), this.options.getItemValue);
    }

    // Set selected items based on a jQuery-selector or selection
    // Multiple selected items for a single-select dropdownlist selects the first item
    Dropdownlist.prototype.setSelectedItems = function (selector) {
        let items = this.options.getItems(this.element);
        let selectedItems = items.filter(selector);

        // Make sure we select exactly one element for single-select
        if (!this.options.isMultiselect(this.element)) {
            selectedItems = selectedItems.first();

            if (selectedItems.length === 0) {
                selectedItems = items.first();
            }
        }

        // Select and deselect items as required
        items.not(selectedItems).find('input.dropdownlist-field:checked').prop('checked', false);
        selectedItems.find('input.dropdownlist-field:not(:checked)').prop('checked', true);

        this.setSelectorText();
    }

    // Select all items
    Dropdownlist.prototype.selectAllItems = function () {
        this.setSelectedItems('*');
    }

    // Deselect all items
    Dropdownlist.prototype.clearSelectedItems = function () {
        this.setSelectedItems(false);
    }

    // Check if all items are currently selected
    Dropdownlist.prototype.areAllItemsSelected = function () {
        return this.options.getItems(this.element).has('input.dropdownlist-field:not(:checked)').not(this.options.getSelectAllItem(this.element)).length === 0;
    }

}(jQuery));