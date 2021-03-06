import React, {useState, useEffect, useRef} from 'react';
import {Editor, EditorState, convertToRaw, convertFromRaw, Modifier, SelectionState, ContentBlock, ContentState, genKey} from 'draft-js';
import {useParams} from "react-router-dom";
import {ApiHelper} from '../modules/ApiHelper'; 
import useDidMountEffect from '../modules/usedidmounteffect';

const Card = ({
  uuid, currentCard, findPrevCard, findNextCard, createdNewCardAtTree,
   setCurrentCard, deleteCurrentCardFromTree, setBackSpace, backSpace,
   mergePending, setMergePending, cardCreated, setCardCreated, goUp, setGoUp,
   socket, setSocket,
}) => {
    const [editorState, setEditorState] = useState(() => 
        EditorState.createEmpty(),
    );
    // const [editorStateHistory, setEditorStateHistory] = useState([]);
    var today = new Date();
    const [time, setTime] = useState(); // created에 들어갈 시간 데이터
    const { userId } = useParams(); //현재 페이지에 접속한 이용자 파라미터
    const [card, setCard] = useState(); //현재 커서가 있는 카드의 content text
    // const [uuid, setUuid] = useState(uuid); //현재 커서가 있는 카드의 uuid, 엔터 클릭시 생성된 카드의 uuid
    const [hasEnded, setHasEnded] = useState(false); // 커서의 위치가 끝이면, 변경됨을 알려줌
    const [textDifference, setTextDifference] = useState(false);
    const [cursorDifference, setCursorDifference] = useState(false);
    const [oldOffsets, setOldOffsets] = useState({AnchorOffset: 0, FocusOffset: 0});
    const cursorRef = useRef();

    const DEFAULT_URL = "http://54.180.147.138"

    //socket loading!
    

    const onChange = (editState) => {
      console.log(checkTextDifference(editorState, editState));
      const oldSelectionState = editorState.getSelection();
      const oldAnchorOffset = oldSelectionState.getAnchorOffset();
      const oldFocusOffset = oldSelectionState.getFocusOffset();
      setOldOffsets({AnchorOffset: oldAnchorOffset, FocusOffset: oldFocusOffset});
      if(checkTextDifference(editorState, editState)){
        setTextDifference(true);
      }
      if(checkCursorDifference(editorState, editState)){
        setCursorDifference(true);
      }
      setEditorState(editState);
      // updateData(uuid);
      setCurrentCard(uuid);
    }
    //소켓을 통하여 변화가 있을 경우에 보내주는 것 -> 보낼 내용 contentState Raw화 한것, 변경한 userid, 변경한 object id, 변화 이전 업데이터의 커서 오프셋, 오프셋 변화량(나중 오프셋 - 이전 오프셋)
    useEffect(() => {
      if (socket == null || editorState == null || textDifference == false) return;
      const contentState = editorState.getCurrentContent();
      const rawContentState = convertToRaw(contentState);
      const selectionState = editorState.getSelection();
      const AnchorOffset = selectionState.getAnchorOffset();
      const FocusOffset = selectionState.getFocusOffset();
      const AnchorDelta = AnchorOffset - oldOffsets["AnchorOffset"];
      const FocusDelta = FocusOffset - oldOffsets["FocusOffset"];
      const offsetDelta = {AnchorDelta: AnchorDelta, FocusDelta: FocusDelta};
      socket.emit("send-changes", {delta: rawContentState, id: userId, objectId: uuid, oldOffsets: oldOffsets, offsetDelta: offsetDelta});
      setTextDifference(false);
    }, [socket, editorState, textDifference]);

    const checkOffsetDelta = (myOffset, targetOffset, targetDelta) => {
      if(myOffset<=targetOffset) return myOffset;
      return myOffset + targetDelta;
    }

    const checkOffsetBetween = (myOffset, targetAnchorOffset, targetFocusOffset) => {
      if(targetAnchorOffset<myOffset && myOffset<targetFocusOffset) return targetAnchorOffset;
      if(targetFocusOffset<myOffset && myOffset<targetAnchorOffset) return targetFocusOffset;
      return null;
    }

    const changeSelectionState = (changedOffset, checkBetweenOffset, selectionState) => {
      if(checkBetweenOffset) {
        const changedSelectionState = selectionState.set('focusOffset', checkBetweenOffset);
        const changedSelectionStateWithAnchor = changedSelectionState.set('anchorOffset', checkBetweenOffset);
        return changedSelectionStateWithAnchor;
      }
      const changedSelectionState = selectionState.set('focusOffset', changedOffset);
      const changedSelectionStateWithAnchor = changedSelectionState.set('anchorOffset', changedOffset);
      return changedSelectionStateWithAnchor;
    }

    useEffect(() => {
      if (socket == null || editorState == null) return;
      const handler = (deltamap) => {
        if(deltamap["id"] == userId) return;
        if(deltamap["objectId"] != uuid) return;
        const receivedContentState = convertFromRaw(deltamap["delta"]);
        const currentSelectionState = editorState.getSelection();
        const currentAnchorOffset = currentSelectionState.getAnchorOffset(); // 일단 focus, anchor가 동일하다 가정(블럭 선택 고려 x)
        // const currentFocusOffset = currentSelectionState.getFocusOffset();
        const changedAnchorOffset = checkOffsetDelta(currentAnchorOffset, deltamap["oldOffsets"]["AnchorOffset"], deltamap["offsetDelta"]["AnchorDelta"]);
        // const changedFocusOffset = checkOffsetDelta(currentFocusOffset, deltamap["oldOffsets"]["FocusOffset"], deltamap["offsetDelta"]["FocusDelta"]);
        const checkBetweenOffset = checkOffsetBetween(currentAnchorOffset, deltamap["oldOffsets"]["AnchorOffset"], deltamap["oldOffsets"]["FocusOffset"]);
        const changedSelectionState = changeSelectionState(changedAnchorOffset, checkBetweenOffset, currentSelectionState);
        const receivedEditorState = EditorState.set(editorState, {currentContent: receivedContentState});
        const receivedEditorStateWithSelection = EditorState.acceptSelection(receivedEditorState, changedSelectionState);
        // const receivedEditorState = EditorState.createWithContent(receivedContentState);
        setEditorState(receivedEditorStateWithSelection);
      };
      socket.on("receive-changes", handler);

      return () => {
        socket.off("receive-changes", handler);
      }
    }, [socket, editorState]);

    //editorState History에 기록을 남길 최대 개수를 100개로 제한하기 위해서 setEditorStateHistory를 그냥 사용하지 않고, 개수체크해서 길이를 30아래로 유지하도록 합시다.
    // const addHistory = (editorState) => {
    //   if (editorStateHistory.length === 30) {
    //     editorStateHistory.pop();
    //     editorStateHistory.splice(0,0,editorState);
    //     return;
    //   }
    //   editorStateHistory.splice(0,0,editorState);
    // }
    
    useDidMountEffect(() => {
      // console.log(convertToRaw(editorState.getCurrentContent()).blocks[0])
      var now = today.getHours() + ':' + today.getMinutes() + ':' + today.getSeconds();
      setTime(now);
      updateData(uuid);
    }, [editorState]);
    
    //text difference check! --> check in every onChange(), 만약에 텍스트 변화(스타일)가 있다면, True를 리턴해줄 것임!
    const checkTextDifference = (originalState, changedState) => {
      const originalContent = originalState.getCurrentContent();
      const changedContent = changedState.getCurrentContent();
      const originalText = originalContent.getPlainText();
      const originalCharacterMetadata = originalContent.getFirstBlock().getCharacterList();
      const changedText = changedContent.getPlainText();
      const changedCharacterMetadata = changedContent.getFirstBlock().getCharacterList();
      if(originalText != changedText) return true; //만약에 텍스트가 다르다면! 둘은 다름
      if(originalCharacterMetadata != changedCharacterMetadata) return true; //만약에 스타일이 다르다면! 둘은 다름
      return false; //둘 다 동일하다면, 둘은 같음
    }

    //cursor difference check! --> check in every onChange(), 만약에 커서 위치의 변화가 있다면, True를 리턴해줄 것임!
    const checkCursorDifference = (originalState, changedState) => {
      const originalSelectionState = originalState.getSelection();
      const changedSelectionState = changedState.getSelection();
      const originalStartOffset = originalSelectionState.getStartOffset();
      const changedStartOffset = changedSelectionState.getStartOffset();
      const originalFocusOffset = originalSelectionState.getFocusOffset();
      const changedFocusOffset = changedSelectionState.getFocusOffset();
      if(originalStartOffset != changedStartOffset) return true; //시작위치가 다르다면 둘은 다름
      if(originalFocusOffset != changedFocusOffset) return true; //포커스위치가 다르다면 둘은 다름
      return false; //둘 다 동일하다면, 둘은 동일함
    }
    
    useDidMountEffect(() => {
      if(currentCard == uuid) {
        if(cursorRef.current){
          cursorRef.current.focus();
          // console.log(editorState.getSelection().getHasFocus());
          if(cardCreated) {
            const contentState = editorState.getCurrentContent();
            const selectionState = editorState.getSelection();
            const length = contentState.getPlainText().length;
            const mergedSelectionState = selectionState.merge({
              focusOffset: length,
              anchorOffset: length,
              hasFocus: true,
            });
            setEditorState(EditorState.acceptSelection(editorState, mergedSelectionState));
            setCardCreated(false);
          }
          if(backSpace){
            setEditorState(EditorState.moveFocusToEnd(editorState));
            if(mergePending){
              const contentState = editorState.getCurrentContent();
              const selectionState = editorState.getSelection();
              const focusKey = selectionState.getFocusKey();
              const length = contentState.getPlainText().length;
              const mergedContentState = mergeBlockToContentState(contentState, mergePending);
              const newCardRaw = convertToRaw(mergedContentState);
              const mergedEditorState2 = EditorState.createWithContent(convertFromRaw(newCardRaw))
              const mergedSelectionState = selectionState.merge({
                focusKey: focusKey,
                focusOffset: length,
                anchorOffset: length,
                hasFocus: true,
              })
              setEditorState(EditorState.acceptSelection(mergedEditorState2, mergedSelectionState));
              setMergePending(null);
            }
            setBackSpace(false);
          }
          if(goUp){
            setEditorState(EditorState.moveFocusToEnd(editorState));
            setGoUp(false);
          }
        }
      }
    },[currentCard])


    useEffect(() => {
      if(cardCreated) return;
      getData(uuid);
    }, [])
  
    const getData = async (uuid) => {
      const response = await ApiHelper(`${DEFAULT_URL}/card/find`, null, 'POST',{
        _id: uuid,
      })
      // console.log(uuid)
      // console.log(response)
      setCard(response)
      if (response){
        // console.log(response.content)
        const parsedContent = JSON.parse(response.content)
        const defaultEditorState = EditorState.createWithContent(convertFromRaw(parsedContent))
        setEditorState(defaultEditorState)  
      }else{
        // console.log("No Response so default empty editor state returned")
      }
    }
    //위의 카드로 올라갈때의 설정
    const goingUp = () => {
      const selectionState = editorState.getSelection();
      //start는 현재 카드에서의 커서의 위치 반환(텍스트의 index와 동일)
      let start = selectionState.getStartOffset();
      if (start === 0){
        //현재 카드줄에 텍스트가 없다면
        // if(!currentContent.hasText()){
        //   findPrevCard(uuid, 'delete');
        //   //currentCard의 uuid를 위의 카드값으로 변경
        // }else{
        //   findPrevCard(uuid);
        // }
        findPrevCard(uuid);
      }
    }
    //아래의 카드로 내려갈때의 설정
    const goingDown = () => {
      const currentContent = editorState.getCurrentContent();
      //현재 카드에 적혀있는 텍스트의 길이
      const length = currentContent.getLastBlock().getLength();
      const selectionState = editorState.getSelection();
      //현재 카드에 있는 커서의 위치
      let start = selectionState.getStartOffset();
      //현재 커서 위치가 카드줄의 마지막이라면
      if (start === length) {
        findNextCard(uuid);
      }
      // if(length === start){
      //   console.log('ended');
      //   setHasEnded(Math.random());
      // }else{
      //   console.log('Not ended yet');
      //   setHasEnded(false);
      // }
    }

// 백스페이스 key = backspace, keyCode = 8

    //키를 누를때 반응하는 함수
    const onKeyDown = (evt) => {
      // console.log("In Key Down")
      // console.log(evt.keyCode)
      //백스페이스를 눌렀을 때
      if (evt.keyCode === 8){
        // 커서 위치가 맨 처음이면서 동시에 카드에 들어있는 내용이 아예없다면! 지워버려야죠
        const contentState = editorState.getCurrentContent();
        const contentLength = contentState.getPlainText().length;
        const selectionState = editorState.getSelection();
        const start = selectionState.getFocusOffset();
        const mergeBlockMap = contentState.getBlockMap();
        const mergeBlock = contentState.getFirstBlock();
        const anchorOffSet = selectionState.getAnchorOffset();
        if (start === 0) {
          if (contentLength === 0) {
            setBackSpace(true); //BackSpace로 이동할 때에는 위의 Card의 맨 끝으로 가야하기 위해서 선언한 State입니다. 위의 Card렌더링시에 BackSpace가 True이면 커서를 맨 끝으로 설정해 준 후에,
            deleteCurrentCardFromTree(uuid);
          }
          else if (anchorOffSet != 0){
            // console.log('anchor')
            return
          }
          //카드에 들어있는 내용이 있다면, 위의 줄과 Merge해줘야 합니다.
          else{
            setBackSpace(true);
            setMergePending(mergeBlock);
            deleteCurrentCardFromTree(uuid);
          }
        }
      }
      if (evt.key === "ArrowUp"){
        goingUp()
        console.log("arrow up")
        return
      }
      if (evt.key === "ArrowDown"){
        goingDown()
        console.log("arrow down")
        return
      }
      if (evt.key === "ArrowLeft"){
        const contentState = editorState.getCurrentContent();
        const focusPosition = editorState.getSelection().getFocusOffset();
        if (focusPosition === 0){
          console.log("Arrow left");
          findPrevCard(uuid);
        }
      }
      if (evt.key === "ArrowRight"){
        const contentState = editorState.getCurrentContent();
        const focusPosition = editorState.getSelection().getFocusOffset();
        const contentLength = contentState.getPlainText().length;
        if (focusPosition === contentLength){
          console.log("Arrow right");
          findNextCard(uuid);
        }
      }
      //탭을 눌렀을 때 -> 탭만 vs 쉬프트_탭
      if (evt.key === "Tab"){
        // setCurrentCard()
      }
      //엔터를 눌렀을 때
      if (evt.keyCode === 13){
        //새로운 카드를 생성해야함
        //먼저 하나의 카드에 다음 줄로 넘어가는 것을 롤백해야함.
        const contentState = editorState.getCurrentContent();
        const focusPosition = editorState.getSelection().getFocusOffset();
        const contentLength = contentState.getPlainText().length;
        if(focusPosition == contentLength){
          console.log("newCard!!!!!!")
          const firstBlock = contentState.getFirstBlock();
          const modifiedContentState = ContentState.createFromBlockArray([firstBlock]);
          const modifiedEditorState = EditorState.createWithContent(modifiedContentState);
          setEditorState(modifiedEditorState);
          setCardCreated(true);
          newCard();
          // setEditorState(EditorState.undo(editorState));
        }
        else{
          setEditorState(EditorState.undo(editorState));
          const selectionState = editorState.getSelection();
          const splitedBlocks = Modifier.splitBlock(contentState, selectionState);
          const modifiedContentState = ContentState.createFromBlockArray([splitedBlocks.getFirstBlock()]);
          const modifiedEditorState = EditorState.createWithContent(modifiedContentState);
          setEditorState(modifiedEditorState);
          const newContentState = ContentState.createFromBlockArray([splitedBlocks.getLastBlock()]);
          const newEditorState = EditorState.createWithContent(newContentState);
          newCard(newEditorState);
        }
        // setEditorState(editorStateHistory[1]);
        //커서 위치도 옯겨가야함!
      }
    }

    //새로운, 빈, 카드 데이터 생성
    const newCard = async (newCardEditorState = EditorState.createEmpty()) => {
      // const newCardEditorState = EditorState.createEmpty();
      const newCardContentState = newCardEditorState.getCurrentContent();
      const newCardRaw = convertToRaw(newCardContentState);
      const newCardRawToString = JSON.stringify(newCardRaw);
      const response = await ApiHelper(`${DEFAULT_URL}/card/create`, null, 'POST', {
        content: newCardRawToString, //엔터를 누르는 곳 뒤에 텍스트가 있다면, 
        created: time,
        updater: userId,
      })
      // console.log("new Card");
      // console.log(response)
      //새로운 카드의 id 로 uuid 업데이트
      createdNewCardAtTree(response._id);
      setCurrentCard(response._id);
      // console.log(response._id)
    }

    //카드 데이터 셋 생성
    const createData = async () => {
        const contentState = editorState.getCurrentContent();
        const raw = convertToRaw(contentState);
        const rawToString = JSON.stringify(raw);
        const response = await ApiHelper(`${DEFAULT_URL}/card/create`, null, 'POST', {
            content: rawToString,
            created: time,
            updater: userId,
          }
          )
        // console.log(editorState.getCurrentContent());
        console.log(convertFromRaw(raw))
        // console.log(convertToRaw(newEditorState.getCurrentContent()));
        console.log("Saving")
        if (response){
          console.log(response)
        }
    }

    //카드 텍스트 업데이트
    const updateData = async (uuid) => {
        const contentState = editorState.getCurrentContent();
        // console.log('update data');
        // console.log(contentState.getPlainText());
        const raw = convertToRaw(contentState);
        const rawToString = JSON.stringify(raw);
        const response = await ApiHelper(`${DEFAULT_URL}/card/update`, null, 'POST', {
            _id: uuid,
            content: rawToString,
            created: time,
            updater: userId,
          }
        )
        // console.log("Updating");
        // console.log(time);
        if (response){
          // console.log(response)
        }
    }
    
    //카드 데이터셋 삭제
    const deleteData = async () => {
      const response = await ApiHelper(`${DEFAULT_URL}/card/delete`,null,'POST', {
        _id: uuid,
      })
      console.log(response)
    }
    //ContentBlock 한개만 기존 contentState에 Merge하는 함수, 문제점이 있음! -> 기존에 contentState에 BlockMap에 추가해주며, 결과적으로 다음줄로 새로운 블럭이 나타납니다.
    const mergeBlockToContentState = (contentState, mergingBlock) => {
      const blockMap = contentState.getBlockMap();
      const lastBlock = contentState.getLastBlock();
      const newBlock = mergeBlockToAnotherBlock(lastBlock, mergingBlock);
      const newContentState = ContentState.createFromBlockArray([newBlock]);
      return newContentState;
    }

    //수정중인 함수-> 하나의 contentBlock에 다른 contentBlock의 내용을 가져와서 Merge하는 함수
    const mergeBlockToAnotherBlock = (originalBlock, mergingBlock) => {
      const newBlock = new ContentBlock({
        key: originalBlock.getKey(),
        text: originalBlock.getText().concat(mergingBlock.getText()),
        characterList: originalBlock.getCharacterList(),
        depth: originalBlock.getDepth(),
        data: originalBlock.getData(),
      });
      return newBlock
    }

    // const selectionInitializedEditorState = () => {
    //   const newSelectionState = new SelectionState({
    //     hasFocus: true,
    //   });
    //   const newEditorState = EditorState.createEmpty();
    //   const initializedEditorState = EditorState.forceSelection(newEditorState, newSelectionState);
    //   return initializedEditorState;
    // }


    return (
        <div className = "cards" onKeyDown={onKeyDown}>
          <Editor
          editorState={editorState}
          onChange={onChange}
          ref={cursorRef}
        />
        </div>
    );
  }
  export default Card;
  
  // <div onClick = {deleteData}> click to delete</div>
  // <div onClick = {createData}> click to save</div>
  // <Editor editorState={editorState} onChange = {setEditorState}/>
  // ref={editorRef}
  // <br/>
  // <div onClick = {updateData}> click to update</div>
  // <div onClick = {deleteData}> click to delete</div>
