import React, { Component } from 'react';
import { Map } from 'immutable';
import { EditorState, convertToRaw, convertFromRaw } from 'draft-js';
import { Modifier, DefaultDraftBlockRenderMap, genKey, ContentBlock } from 'draft-js';
import { Editor } from './edited-rdw/react-draft-wysiwyg';
import './edited-rdw/styles.css';
import '../App.css';
import Schemata from './schemas/Schemata';
import SchemataUp from './schemas/SchemataUp';
import SchemataDown from './schemas/SchemataDown';
import SideToolBar from './toolBar/sideToolBar';
import { l_config, r_config } from './config';

const SCHEMA = 'schemata';
const SCHEMA_UP = 'schemata_up';
const SCHEMA_DOWN = 'schemata_down';

/**
 * convert the given block to a given type
 *
 * @param {any} type
 * @param {any} editorState
 * @param {any} selectionState
 * @param {any} contentState
 * @returns new block
 */
const convertBlock = (type, editorState, selectionState, contentState) => {
  const newType = type;
  const key = selectionState.getStartKey();
  const blockMap = contentState.getBlockMap();
  const block = blockMap.get(key);
  const newText = block.getText();
  const newBlock = block.merge({ text: newText, type: newType });
  // const newContentState = contentState.merge({
  //   blockMap: blockMap.set(key, newBlock),
  //   selectionAfter: selectionState.merge({ anchorOffset: 0, focusOffset: 0 })
  // });

  return newBlock;
};

/**
 * generates a new block with a key for a given style
 *
 * @param {any} style
 * @returns new block
 */
const generate_block = style => {
  const newBlockKey = genKey();
  const block = new ContentBlock({ key: newBlockKey, type: style, text: '' });
  return [newBlockKey, block];
};

/**
 * insert schema by identifying the desired schema type
 *
 * @param {any} editorState
 * @param {any} selection
 * @param {any} contentState
 * @param {any} currentBlock
 * @param {any} type
 * @returns new editor state
 */
const insert_schemata = (editorState, selection, contentState, currentBlock, type) => {
  const newBlock = convertBlock('schemata_up', editorState, selection, contentState);
  const blockMap = contentState.getBlockMap();
  // Split the blocks
  const blocksBefore = blockMap.toSeq().takeUntil(function(v) {
    return v === currentBlock;
  });
  const blocksAfter = blockMap
    .toSeq()
    .skipUntil(function(v) {
      return v === currentBlock;
    })
    .rest();

  let newBlocks = [];

  switch (type) {
    case 'half':
      newBlocks = [
        generate_block('unstyled'),
        [currentBlock.getKey(), newBlock],
        generate_block('schemata'),
        generate_block('schemata_down'),
        generate_block('unstyled')
      ];
      break;
    case 'main':
      newBlocks = [
        generate_block('unstyled'),
        [currentBlock.getKey(), newBlock],
        generate_block('schemata'),
        generate_block('schemata_down'),
        generate_block('schemata'),
        generate_block('schemata'),
        generate_block('schemata_down'),
        generate_block('unstyled')
      ];
      break;
    case 'bar':
      newBlocks = [
        generate_block('unstyled'),
        [currentBlock.getKey(), convertBlock('schemata', editorState, selection, contentState)],
        generate_block('unstyled')
      ];
      break;
    case 'inverse':
      newBlocks = [
        generate_block('unstyled'),
        [currentBlock.getKey(), convertBlock('schemata', editorState, selection, contentState)],
        generate_block('schemata_down'),
        generate_block('schemata'),
        generate_block('unstyled')
      ];
      break;
    default:
      newBlocks = null;
  }

  const newBlockMap = blocksBefore.concat(newBlocks, blocksAfter).toOrderedMap();
  const newContentState = contentState.merge({
    blockMap: newBlockMap,
    selectionBefore: selection,
    selectionAfter: selection
  });
  return EditorState.push(editorState, newContentState, 'insert-fragment');
};

const getBlockRendererFn = (getEditorState, onChange) => block => {
  const type = block.getType();
  switch (type) {
    case 'schemata':
      return {
        component: Schemata,
        props: {
          getEditorState,
          onChange
        }
      };
    case 'schemata_up':
      return {
        component: SchemataUp,
        props: {
          getEditorState,
          onChange
        }
      };
    case 'schemata_down':
      return {
        component: SchemataDown,
        props: {
          getEditorState,
          onChange
        }
      };
    default:
      return null;
  }
};

class ZEditor extends Component {
  constructor(props) {
    super(props);

    this.state = {
      editorState: EditorState.createEmpty()
    };

    this.refer = null;

    /* blockRenderMap */
    this.blockRenderMap = Map({
      [SCHEMA]: {
        element: 'div'
      },
      [SCHEMA_UP]: {
        element: 'div'
      },
      [SCHEMA_DOWN]: {
        element: 'div'
      }
    }).merge(DefaultDraftBlockRenderMap);

    this.onEditorStateChange = editorState => {
      this.props.setDownloadState(convertToRaw(this.state.editorState.getCurrentContent()));
      this.setState({ editorState });
    };

    this.blockRendererFn = getBlockRendererFn(this.getEditorState, this.onEditorStateChange);

    this.onUserClick = this.insert_schema.bind(this);
  }

  componentDidMount() {
    this.refs.editor.focusEditor();
  }

  blockStyleFn = block => {
    switch (block.getType()) {
      case SCHEMA:
        return 'schemata';
      case SCHEMA_UP:
        return 'schemata_up';
      case SCHEMA_DOWN:
        return 'schemata_down';
      default:
        return 'block';
    }
  };

  // change editor state when import a file
  /**
   * @author Shehab Adel
   * @date 12/08/2022
   * @update fixed an issue where an uploaded file will be empty if we tried to
   *  download it immediately after uploading without making any changes. Fixed this issue
   *  by updating the download state to the new uploaded editor state immediately after uploading.
   */
  changeEditorStateByUpload = newEditorState => {
    let editorState = EditorState.createWithContent(convertFromRaw(JSON.parse(newEditorState)));
    this.setState({ editorState: editorState });
    this.props.setDownloadState(convertToRaw(this.state.editorState.getCurrentContent()));
  };

  insertFN = (symbol, type, side) => {
    if (type) {
      this.insert_schema(type);
    } else {
      this.insertSymbol(symbol);
    }
  };

  insert_schema = type => {
    const editorState = this.state.editorState;
    const contentState = editorState.getCurrentContent();
    const selectionState = editorState.getSelection();
    const key = selectionState.getStartKey();
    const blockMap = contentState.getBlockMap();
    const block = blockMap.get(key);

    this.setState(
      {
        editorState: insert_schemata(editorState, selectionState, contentState, block, type)
      },
      () => {
        this.refs.editor.focusEditor();
      }
    );
  };

  insertSymbol = symbol => {
    const editorState = this.state.editorState;
    const contentState = editorState.getCurrentContent();
    const selectionState = editorState.getSelection();
    const newContentState = Modifier.insertText(contentState, selectionState, symbol, null, null);

    this.setState(
      {
        editorState: EditorState.push(editorState, newContentState, 'add-text')
      },
      () => {
        this.refs.editor.focusEditor();
      }
    );
  };

  render() {
    const bar = r_config.map(btn => (
      <SideToolBar side={'right'} data={btn.data} key={btn.id} insertFn={this.insertFN} />
    ));

    return (
      <div className="container-content">
        <ul className="menu">{bar}</ul>
        <ul className="menu_left">
          {'schema'}

          <SideToolBar side={'left'} data={l_config} insertFn={this.insertFN} />
        </ul>

        <div>
          <div id={'here'}>
            <Editor
              editorState={this.state.editorState}
              onEditorStateChange={this.onEditorStateChange}
              blockStyleFn={this.blockStyleFn}
              blockRenderMap={this.blockRenderMap}
              blockRendererFn={this.blockRendererFn}
              editorClassName="page"
              ref="editor"
            />
          </div>
        </div>
        {/*<div className="container-content">
                    <pre>{JSON.stringify(convertToRaw(this.state.editorState.getCurrentContent()), null, 1)}</pre>
                </div>*/}
        <center>
          <small>
            Made with ♥ by{' '}
            <a href="https://github.com/Open-SL" target="_blank" rel="noopener noreferrer">
              Open_SL
            </a>
          </small>
        </center>
      </div>
    );
  }
}
export default ZEditor;
